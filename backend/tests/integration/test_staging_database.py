"""Real-database smoke tests. These are intentionally impossible to run by accident.

Required environment variables:
  TMAS_TEST_ENV=staging
  TEST_SUPABASE_URL=<dedicated non-production project URL>
  TEST_SUPABASE_SERVICE_ROLE_KEY=<dedicated non-production service key>

TEST_SUPABASE_URL must differ from SUPABASE_URL. Test rows use a unique prefix and are
removed in reverse dependency order even when an assertion fails.
"""
import os
import uuid

import pytest


def _staging_client():
    if os.getenv('TMAS_TEST_ENV', '').lower() != 'staging':
        pytest.skip('set TMAS_TEST_ENV=staging to enable destructive staging integration tests')
    url = os.getenv('TEST_SUPABASE_URL', '').rstrip('/')
    key = os.getenv('TEST_SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        pytest.skip('dedicated staging Supabase credentials are not configured')
    if url == os.getenv('SUPABASE_URL', '').rstrip('/'):
        pytest.fail('TEST_SUPABASE_URL must not be the application SUPABASE_URL')
    if any(marker in url.lower() for marker in ('prod', 'production')):
        pytest.fail('refusing to run destructive tests against a production-labelled URL')
    from supabase import create_client
    return create_client(url, key)


def _insert_user(client, *, user_id: str, email: str, role: str = 'student',
                 status: str = 'active', verified: bool = True) -> None:
    client.table('users').insert({
        'id': user_id,
        'name': f'Integration {role.title()}',
        'email': email,
        'password': '$2b$12$invalid.integration.fixture.only',
        'role': role,
        'status': status,
        'email_verified': verified,
        'auth_version': 0,
    }).execute()


def _security_principal(user: dict) -> dict:
    """Exercise the same authoritative account-state rules used by protected API routes."""
    from fastapi import HTTPException
    status = str(user.get('status') or '').lower()
    if status != 'active':
        raise HTTPException(status_code=403, detail='Account is not active')
    if user.get('email_verified', True) is False:
        raise HTTPException(status_code=403, detail='Email verification is required')
    return {
        'sub': str(user['id']),
        'id': str(user['id']),
        'role': str(user.get('role') or '').lower(),
        'status': status,
        'email_verified': user.get('email_verified', True),
        'auth_version': int(user.get('auth_version') or 0),
    }


@pytest.mark.integration
def test_staging_security_schema_and_recipient_read_isolation():
    """Covers the additive security migration and notification recipient isolation.

    Full course/material/quiz authorization flows are exercised by the API E2E suite; this
    test deliberately keeps its database footprint small and validates the security schema
    assumptions against a real staging project.
    """
    client = _staging_client()
    run = uuid.uuid4().hex
    users = [f'it-{run}-a', f'it-{run}-b']
    notification_ids: list[int] = []
    try:
        for user_id, email in zip(users, (f'{run}-a@example.invalid', f'{run}-b@example.invalid')):
            client.table('users').insert({
                'id': user_id,
                'name': 'Integration Test User',
                'email': email,
                'password': '$2b$12$invalid.integration.fixture.only',
                'role': 'student',
                'status': 'active',
                'email_verified': True,
                'auth_version': 0,
            }).execute()
        for user_id in users:
            response = client.table('notifications').insert({
                'user_id': user_id,
                'notification_type': 'integration-test',
                'title': f'Integration {run}',
                'message': 'Safe to delete',
            }).execute()
            notification_ids.append(int(response.data[0]['id']))

        client.table('notifications').update({'is_read': True}).eq(
            'id', notification_ids[0]
        ).eq('user_id', users[0]).execute()
        rows = client.table('notifications').select('id,user_id,is_read').in_('id', notification_ids).execute().data
        by_user = {row['user_id']: row for row in rows}
        assert by_user[users[0]]['is_read'] is True
        assert by_user[users[1]]['is_read'] is False

    finally:
        if notification_ids:
            client.table('notifications').delete().in_('id', notification_ids).execute()
        client.table('users').delete().in_('id', users).execute()


@pytest.mark.integration
def test_staging_authorization_matrix():
    """Validate account state, course boundaries, notification ownership and revocation.

    The test uses only temporary staging rows and cleans them in reverse dependency order.
    It deliberately calls the application's authorization helpers against the real staging
    database, while JWT signature/transport behavior remains covered by the API E2E suite.
    """
    from fastapi import HTTPException
    from app.core import authorization, security
    import app.routers.notifications as notifications

    client = _staging_client()
    run = uuid.uuid4().hex
    ids = {
        'student_a': f'it-{run}-student-a',
        'student_b': f'it-{run}-student-b',
        'suspended': f'it-{run}-suspended',
        'unverified': f'it-{run}-unverified',
        'lecturer_a': f'it-{run}-lecturer-a',
        'lecturer_b': f'it-{run}-lecturer-b',
        'admin': f'it-{run}-admin',
    }
    course_codes = {'a': f'IT{run[:6].upper()}A', 'b': f'IT{run[:6].upper()}B'}
    course_ids: list[int] = []
    notification_ids: list[int] = []
    old_auth_supabase = authorization.supabase
    old_notification_supabase = notifications.supabase
    old_security_loader = security._load_authoritative_user
    try:
        fixtures = [
            ('student_a', 'student', 'active', True),
            ('student_b', 'student', 'active', True),
            ('suspended', 'student', 'suspended', True),
            ('unverified', 'student', 'active', False),
            ('lecturer_a', 'lecturer', 'active', True),
            ('lecturer_b', 'lecturer', 'active', True),
            ('admin', 'admin', 'active', True),
        ]
        for key, role, status, verified in fixtures:
            _insert_user(
                client, user_id=ids[key], email=f'{run}-{key}@example.invalid',
                role=role, status=status, verified=verified,
            )

        courses = client.table('courses').insert([
            {'code': course_codes['a'], 'title': 'Integration Course A'},
            {'code': course_codes['b'], 'title': 'Integration Course B'},
        ]).execute().data
        course_by_code = {row['code']: row['id'] for row in courses}
        course_ids.extend(int(row['id']) for row in courses)

        client.table('course_lecturers').insert([
            {'course_id': course_by_code[course_codes['a']], 'lecturer_id': ids['lecturer_a']},
            {'course_id': course_by_code[course_codes['b']], 'lecturer_id': ids['lecturer_b']},
        ]).execute()
        client.table('course_enrollments').insert([
            {'course_id': course_by_code[course_codes['a']], 'student_id': ids['student_a'], 'status': 'active'},
            {'course_id': course_by_code[course_codes['b']], 'student_id': ids['student_b'], 'status': 'active'},
        ]).execute()

        # Point application authorization helpers at the dedicated staging client.
        authorization.supabase = client
        notifications.supabase = client

        student_a = {'sub': ids['student_a'], 'role': 'student', 'status': 'active', 'email_verified': True}
        lecturer_a = {'sub': ids['lecturer_a'], 'role': 'lecturer', 'status': 'active', 'email_verified': True}
        admin = {'sub': ids['admin'], 'role': 'admin', 'status': 'active', 'email_verified': True}

        authorization.require_course_access(student_a, course_codes['a'])
        with pytest.raises(HTTPException) as exc:
            authorization.require_course_access(student_a, course_codes['b'])
        assert exc.value.status_code == 403

        authorization.require_lecturer_course(lecturer_a, course_codes['a'])
        with pytest.raises(HTTPException) as exc:
            authorization.require_lecturer_course(lecturer_a, course_codes['b'])
        assert exc.value.status_code == 403

        authorization.require_course_access(admin, course_codes['a'])
        authorization.require_course_access(admin, course_codes['b'])

        # Student cannot create system notifications.
        with pytest.raises(HTTPException) as exc:
            notifications._recipient_ids(
                notifications.CreateNotificationRequest(
                    title='Forbidden', message='Forbidden', target_role='student', course=course_codes['a']
                ),
                student_a,
            )
        assert exc.value.status_code == 403

        # Lecturer A may target enrolled students in A, never Course B.
        recipients = notifications._recipient_ids(
            notifications.CreateNotificationRequest(
                title='Course A', message='Allowed', target_role='student', course=course_codes['a']
            ),
            lecturer_a,
        )
        assert recipients == [ids['student_a']]
        with pytest.raises(HTTPException) as exc:
            notifications._recipient_ids(
                notifications.CreateNotificationRequest(
                    title='Course B', message='Forbidden', target_role='student', course=course_codes['b']
                ),
                lecturer_a,
            )
        assert exc.value.status_code == 403

        # Notification ownership: another student's ID is insufficient to update the row.
        inserted = client.table('notifications').insert({
            'user_id': ids['student_b'], 'notification_type': 'integration-test',
            'title': f'Ownership {run}', 'message': 'Student B only',
        }).execute().data[0]
        notification_ids.append(int(inserted['id']))
        result = client.table('notifications').update({'is_read': True}).eq(
            'id', inserted['id']
        ).eq('user_id', ids['student_a']).execute()
        assert not (result.data or [])
        row = client.table('notifications').select('is_read').eq('id', inserted['id']).single().execute().data
        assert row['is_read'] is False

        # Authoritative state blocks suspended and unverified accounts.
        user_rows = client.table('users').select(
            'id,email,role,status,email_verified,auth_version'
        ).in_('id', [ids['suspended'], ids['unverified'], ids['student_a']]).execute().data
        by_id = {row['id']: row for row in user_rows}
        for key in ('suspended', 'unverified'):
            with pytest.raises(HTTPException) as exc:
                _security_principal(by_id[ids[key]])
            assert exc.value.status_code == 403

        # A token carrying auth_version=0 becomes invalid after the DB version increments.
        def staging_loader(user_id):
            rows = client.table('users').select(
                'id,name,email,role,status,email_verified,level,program,auth_version'
            ).eq('id', user_id).limit(1).execute().data
            return rows[0] if rows else None

        security._load_authoritative_user = staging_loader
        stale_claims = {
            'sub': ids['student_a'], 'role': 'student', 'auth_version': 0,
            'email': f'{run}-student_a@example.invalid',
        }
        assert security.get_current_principal(stale_claims)['sub'] == ids['student_a']
        client.table('users').update({'auth_version': 1}).eq('id', ids['student_a']).execute()
        with pytest.raises(HTTPException) as exc:
            security.get_current_principal(stale_claims)
        assert exc.value.status_code == 401

    finally:
        authorization.supabase = old_auth_supabase
        notifications.supabase = old_notification_supabase
        security._load_authoritative_user = old_security_loader
        if notification_ids:
            client.table('notifications').delete().in_('id', notification_ids).execute()
        client.table('course_enrollments').delete().in_('student_id', list(ids.values())).execute()
        client.table('course_lecturers').delete().in_('lecturer_id', list(ids.values())).execute()
        if course_ids:
            client.table('courses').delete().in_('id', course_ids).execute()
        client.table('users').delete().in_('id', list(ids.values())).execute()

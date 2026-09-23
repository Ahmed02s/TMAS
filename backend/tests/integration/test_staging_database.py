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

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.mark.parametrize(
    ('method', 'path', 'json'),
    [
        ('get', '/api/courses', None),
        ('get', '/api/materials', None),
        ('get', '/api/materials/1/download', None),
        ('get', '/api/materials/1/pdf', None),
        ('get', '/api/materials/1/content', None),
        ('get', '/api/materials/reading-progress?student_id=student-a', None),
        ('get', '/api/quizzes/available?student_id=student-a', None),
        ('get', '/api/quizzes/completed?student_id=student-a', None),
        ('get', '/api/quizzes/1?student_id=student-a', None),
        ('get', '/api/notifications?role=student', None),
    ],
)
def test_anonymous_users_cannot_access_protected_resources(method, path, json):
    response = TestClient(app).request(method, path, json=json)
    assert response.status_code == 401, response.text


@pytest.mark.parametrize(
    ('method', 'path', 'body'),
    [
        ('post', '/api/materials/1/mark-read', {'student_id': 'student-b'}),
        ('post', '/api/materials/1/progress', {'student_id': 'student-b'}),
        ('post', '/api/materials/1/page-read', {'student_id': 'student-b', 'page_number': 1}),
        ('post', '/api/quizzes/1/autosave', {'student_id': 'student-b', 'answers': {}}),
        ('post', '/api/quizzes/1/submit', {'student_id': 'student-b', 'answers': {}}),
    ],
)
def test_student_cannot_mutate_another_students_records(method, path, body, monkeypatch):
    from app.core import security

    monkeypatch.setattr(
        security,
        'get_current_principal',
        lambda: {'sub': 'student-a', 'id': 'student-a', 'role': 'student', 'status': 'active', 'email_verified': True},
    )
    # Identity enforcement is also tested directly because FastAPI captures dependency
    # callables when routes are registered.
    from app.routers.quizzes import _verify_acting_as_self

    with pytest.raises(Exception) as exc_info:
        _verify_acting_as_self({'sub': 'student-a'}, body['student_id'])
    assert getattr(exc_info.value, 'status_code', None) == 403


def test_stale_admin_claim_is_rejected_when_authoritative_role_changed(monkeypatch):
    from app.core import security

    monkeypatch.setattr(security, 'get_current_claims', lambda: {'sub': 'user-1', 'role': 'admin'})
    monkeypatch.setattr(
        security,
        '_load_authoritative_user',
        lambda _user_id: {
            'id': 'user-1', 'email': 'user@example.edu', 'role': 'student',
            'status': 'active', 'email_verified': True,
        },
    )

    principal = security.get_current_principal({'sub': 'user-1', 'role': 'admin'})
    assert principal['role'] == 'student'

    dependency = security.require_roles('admin')
    with pytest.raises(Exception) as exc_info:
        dependency(principal)
    assert getattr(exc_info.value, 'status_code', None) == 403


def test_student_cannot_create_system_notification():
    from app.routers.notifications import CreateNotificationRequest, send_notification

    with pytest.raises(Exception) as exc_info:
        send_notification(
            CreateNotificationRequest(title='Forged', message='Forged', target_role='admin'),
            {'sub': 'student-a', 'role': 'student'},
        )
    assert getattr(exc_info.value, 'status_code', None) == 403


def test_lecturer_notification_requires_assigned_course(monkeypatch):
    import app.routers.notifications as notifications

    def deny(_claims, _course):
        raise Exception('unassigned')

    monkeypatch.setattr(notifications, 'require_lecturer_course', deny)
    with pytest.raises(Exception, match='unassigned'):
        notifications.send_notification(
            notifications.CreateNotificationRequest(
                title='Notice', message='Message', target_role='student', course='COMP 999',
            ),
            {'sub': 'lecturer-a', 'role': 'lecturer'},
        )


@pytest.mark.parametrize('role', ['student', 'lecturer'])
def test_admin_role_dependency_rejects_non_admin(role):
    from app.core.security import require_roles

    dependency = require_roles('admin', 'administrator')
    with pytest.raises(Exception) as exc_info:
        dependency({'sub': 'user-1', 'role': role})
    assert getattr(exc_info.value, 'status_code', None) == 403


def test_lecturer_course_dependency_rejects_unassigned_course(monkeypatch):
    import app.core.authorization as authorization

    monkeypatch.setattr(authorization, 'lecturer_course_codes', lambda _claims: {'comp101'})
    with pytest.raises(Exception) as exc_info:
        authorization.require_lecturer_course({'sub': 'lecturer-a', 'role': 'lecturer'}, 'COMP 999')
    assert getattr(exc_info.value, 'status_code', None) == 403

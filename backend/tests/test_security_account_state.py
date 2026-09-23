from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.security import decode_access_token, hash_password, verify_password
from app.routers.auth import AuthLoginRequest, AuthRegisterRequest


class _UserQuery:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args, **_kwargs): return self
    def eq(self, key, value):
        self.rows = [row for row in self.rows if row.get(key) == value]
        return self
    def limit(self, _value): return self
    def execute(self): return SimpleNamespace(data=self.rows, error=None, status_code=200)


class _UserClient:
    def __init__(self, rows): self.rows = rows
    def table(self, name):
        assert name == 'users'
        return _UserQuery(list(self.rows))


def test_plaintext_passwords_are_never_accepted():
    assert verify_password('legacy-password', 'legacy-password') is False


def test_registration_response_does_not_issue_session_token(monkeypatch):
    import app.routers.auth as auth

    created = {
        'id': 'student-new', 'name': 'New Student', 'email': 'new@example.edu',
        'role': 'student', 'status': 'active', 'level': 'Level 100',
        'program': 'Computer Science', 'email_verified': False,
    }

    class InsertQuery:
        def insert(self, _record): return self
        def execute(self): return SimpleNamespace(data=[created], error=None, status_code=201)

    monkeypatch.setattr(auth, 'ensure_supabase_enabled', lambda: None)
    monkeypatch.setattr(auth, 'supabase', SimpleNamespace(table=lambda _name: InsertQuery()))
    monkeypatch.setattr(auth, '_start_email_verification', lambda *_args, **_kwargs: True)
    monkeypatch.setattr(auth, 'sync_student_enrollments', lambda *_args: True)

    result = auth.register(AuthRegisterRequest(
        name='New Student', email='new@example.edu', password='strong-pass-2026',
        role='student', level='Level 100', program='Computer Science',
        index_number='UEB1234567',
    ))

    assert 'token' not in result
    assert result['authentication_required'] is True
    assert result['next_action'] == 'verify_email_and_login'


@pytest.mark.parametrize(
    ('role', 'status', 'verified', 'expected_status'),
    [
        ('student', 'active', False, 403),
        ('lecturer', 'pending', True, 403),
        ('lecturer', 'active', True, 200),
        ('student', 'suspended', True, 403),
        ('student', 'active', True, 200),
    ],
)
def test_login_enforces_current_verification_and_approval(monkeypatch, role, status, verified, expected_status):
    import app.routers.auth as auth

    user = {
        'id': 'user-1', 'name': 'User', 'email': 'user@example.edu',
        'password': hash_password('strong-pass-2026'), 'role': role,
        'status': status, 'email_verified': verified, 'auth_version': 0,
    }
    monkeypatch.setattr(auth, 'ensure_supabase_enabled', lambda: None)
    monkeypatch.setattr(auth, 'supabase', _UserClient([user]))

    if expected_status != 200:
        with pytest.raises(HTTPException) as exc_info:
            auth.login(AuthLoginRequest(email=user['email'], password='strong-pass-2026'))
        assert exc_info.value.status_code == expected_status
    else:
        result = auth.login(AuthLoginRequest(email=user['email'], password='strong-pass-2026'))
        assert decode_access_token(result['token'])['role'] == role


@pytest.mark.parametrize('state', [
    {'status': 'suspended', 'email_verified': True},
    {'status': 'active', 'email_verified': False},
])
def test_authoritative_principal_rejects_revoked_account_state(monkeypatch, state):
    from app.core import security

    user = {'id': 'user-1', 'role': 'admin', 'auth_version': 0, **state}
    monkeypatch.setattr(security, '_load_authoritative_user', lambda _user_id: user)
    with pytest.raises(HTTPException) as exc_info:
        security.get_current_principal({'sub': 'user-1', 'role': 'admin', 'auth_version': 0})
    assert exc_info.value.status_code == 403

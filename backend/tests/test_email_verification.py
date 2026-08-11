import app.routers.auth as auth_router
from app.core import email as email_core


class _RaisingTable:
    """Stands in for supabase.table(...) and blows up on any call, so we can prove
    _start_email_verification really does swallow failures instead of propagating them."""
    def insert(self, *_args, **_kwargs):
        raise RuntimeError('email_verifications table does not exist yet')


class _RaisingSupabase:
    def table(self, *_args, **_kwargs):
        return _RaisingTable()


def test_start_email_verification_never_raises_when_table_missing(monkeypatch):
    monkeypatch.setattr(auth_router, 'supabase', _RaisingSupabase())
    # Should not raise — a deployment that hasn't run the email_verifications migration yet
    # must still be able to register accounts exactly as it could before this feature existed.
    assert auth_router._start_email_verification('user-1', 'student@example.edu', 'Ada Lovelace') is False


def test_start_email_verification_never_raises_when_email_send_fails(monkeypatch):
    class _WorkingTable:
        def insert(self, *_args, **_kwargs):
            return self

        def execute(self):
            return None

    class _WorkingSupabase:
        def table(self, *_args, **_kwargs):
            return _WorkingTable()

    def _boom(*_args, **_kwargs):
        raise RuntimeError('SendGrid API key is not configured.')

    monkeypatch.setattr(auth_router, 'supabase', _WorkingSupabase())
    monkeypatch.setattr(auth_router, 'send_verification_email', _boom)

    assert auth_router._start_email_verification('user-1', 'student@example.edu', 'Ada Lovelace') is False


def test_start_email_verification_can_raise_for_resend(monkeypatch):
    class _WorkingTable:
        def insert(self, *_args, **_kwargs):
            return self

        def execute(self):
            return None

    class _WorkingSupabase:
        def table(self, *_args, **_kwargs):
            return _WorkingTable()

    def _boom(*_args, **_kwargs):
        raise RuntimeError('SendGrid API key is not configured.')

    monkeypatch.setattr(auth_router, 'supabase', _WorkingSupabase())
    monkeypatch.setattr(auth_router, 'send_verification_email', _boom)

    try:
        auth_router._start_email_verification('user-1', 'student@example.edu', 'Ada Lovelace', raise_on_failure=True)
    except RuntimeError as exc:
        assert 'SendGrid API key' in str(exc)
    else:
        raise AssertionError('Expected delivery failure to be raised')


def test_verify_email_request_requires_token():
    model = auth_router.VerifyEmailRequest(token='abc123')
    assert model.token == 'abc123'


def test_resend_verification_request_validates_email():
    model = auth_router.ResendVerificationRequest(email='student@example.edu')
    assert model.email == 'student@example.edu'


def test_frontend_email_urls_strip_trailing_slash(monkeypatch):
    monkeypatch.setattr(email_core, 'FRONTEND_URL', 'https://tmas.example.com/')

    reset_payload = email_core._build_email_payload('student@example.edu', 'Ada Lovelace', 'reset-token')
    verify_payload = email_core._build_verification_email_payload('student@example.edu', 'Ada Lovelace', 'verify-token')

    assert 'https://tmas.example.com/forgot-password?token=reset-token' in reset_payload['content'][0]['value']
    assert 'https://tmas.example.com/verify-email?verify_token=verify-token' in verify_payload['content'][0]['value']

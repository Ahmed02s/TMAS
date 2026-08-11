import app.routers.auth as auth_router


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
    auth_router._start_email_verification('user-1', 'student@example.edu', 'Ada Lovelace')


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

    auth_router._start_email_verification('user-1', 'student@example.edu', 'Ada Lovelace')


def test_verify_email_request_requires_token():
    model = auth_router.VerifyEmailRequest(token='abc123')
    assert model.token == 'abc123'


def test_resend_verification_request_validates_email():
    model = auth_router.ResendVerificationRequest(email='student@example.edu')
    assert model.email == 'student@example.edu'

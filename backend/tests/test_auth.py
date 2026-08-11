import importlib
import os

from fastapi.testclient import TestClient


def test_auth_routes_require_supabase_env(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', '')
    monkeypatch.setenv('SUPABASE_ANON_KEY', '')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', '')

    # `supabase` (in app.core.supabase_client) is computed once at import time from
    # app.core.config's env-derived constants. If any other test module has already
    # imported that chain (directly or via a router), reloading only auth_router/main
    # below would leave the earlier, real-credentialed client cached — this test would
    # then see a fully "enabled" Supabase and never hit the 503 path it's asserting on.
    # Reloading the whole chain in dependency order makes this test order-independent.
    import app.core.config as config_module
    import app.core.supabase_client as supabase_client_module
    import app.routers.auth as auth_router
    import main as main_module

    importlib.reload(config_module)
    importlib.reload(supabase_client_module)
    importlib.reload(auth_router)
    importlib.reload(main_module)

    client = TestClient(main_module.app)

    response = client.post('/api/auth/register', json={
        'name': 'Ada Lovelace',
        'email': 'ada@example.edu',
        'password': 'secret123',
        'role': 'student',
        'level': 'Level 300',
        'program': 'Computer Science',
    })

    assert response.status_code == 503, response.text
    assert 'Supabase is not configured' in response.text

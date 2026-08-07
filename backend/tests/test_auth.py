import importlib
import os

from fastapi.testclient import TestClient


def test_auth_routes_require_supabase_env(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', '')
    monkeypatch.setenv('SUPABASE_ANON_KEY', '')

    import app.routers.auth as auth_router
    import main as main_module

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

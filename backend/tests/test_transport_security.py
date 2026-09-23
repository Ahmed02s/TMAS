from fastapi.testclient import TestClient

from main import app


def test_api_security_headers_are_present():
    response = TestClient(app).get('/health')
    assert response.status_code == 200
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert response.headers['x-frame-options'] == 'DENY'
    assert response.headers['referrer-policy'] == 'no-referrer'
    assert "default-src 'none'" in response.headers['content-security-policy']


def test_cors_rejects_arbitrary_origin():
    response = TestClient(app).options(
        '/health',
        headers={
            'Origin': 'https://attacker.example',
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert response.status_code == 400
    assert 'access-control-allow-origin' not in response.headers


def test_cors_accepts_configured_frontend_origin():
    from app.core.config import FRONTEND_URL

    response = TestClient(app).options(
        '/health',
        headers={
            'Origin': FRONTEND_URL.rstrip('/'),
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == FRONTEND_URL.rstrip('/')

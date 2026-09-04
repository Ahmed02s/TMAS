from fastapi.testclient import TestClient

from main import app


def test_deployed_frontend_preflight_allows_credentialed_progress_beacon():
    response = TestClient(app).options(
        '/api/materials/23/progress',
        headers={
            'Origin': 'https://tmas-dusky.vercel.app',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
        },
    )

    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == 'https://tmas-dusky.vercel.app'
    assert response.headers['access-control-allow-credentials'] == 'true'


def test_unknown_origin_does_not_receive_cors_permission():
    response = TestClient(app).options(
        '/api/materials/23/progress',
        headers={
            'Origin': 'https://example.invalid',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
        },
    )

    assert 'access-control-allow-origin' not in response.headers

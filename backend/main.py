from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import EXTRA_CORS_ORIGINS
from app.routers.auth import router as auth_router
from app.routers.contact import router as contact_router
from app.routers.courses import router as courses_router
from app.routers.dashboard import router as dashboard_router
from app.routers.levels import router as levels_router
from app.routers.quizzes import router as quizzes_router
from app.routers.materials import router as materials_router
from app.routers.seed_admin import router as seed_admin_router
from app.routers.notifications import router as notifications_router

app = FastAPI(title='TMAS API')

# No cookies are used for auth (the session token travels in the Authorization header), so
# allow_credentials stays False — but the origin list is still narrowed from '*' to known
# frontends as defense in depth. Add any additional deployed frontend URL via the
# CORS_ORIGINS env var (comma-separated) rather than widening this list.
DEFAULT_CORS_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:8443',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8443',
    'https://tmas-dusky.vercel.app',
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[*DEFAULT_CORS_ORIGINS, *EXTRA_CORS_ORIGINS],
    allow_origin_regex=r'https://.*\.vercel\.app',
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router)
app.include_router(contact_router)
app.include_router(levels_router)
app.include_router(courses_router)
app.include_router(quizzes_router)
app.include_router(dashboard_router)
app.include_router(materials_router)
app.include_router(seed_admin_router)
app.include_router(notifications_router)


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}

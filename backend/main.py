import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

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

# Session auth uses the Authorization header rather than cookies, but final reading-progress
# and quiz-exit updates use navigator.sendBeacon. Browsers send cross-origin beacons in
# credentials mode "include", so their preflight requires Access-Control-Allow-Credentials.
# This remains safe because origins are restricted to known frontends rather than '*'. Add
# deployed frontend URLs through CORS_ORIGINS instead of widening that policy.
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
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# An unhandled exception anywhere in a route (a missing DB table, a bad query, anything not
# already wrapped in its own try/except) crashes hard enough to bypass CORSMiddleware —
# Starlette's outer ServerErrorMiddleware catches it and returns a plain-text response with
# no CORS headers at all, which every browser reports as "blocked by CORS policy" regardless
# of how correctly CORS itself is configured. That's cost real debugging time more than once
# (see git history for /api/contact) because the real error — a 500 — never showed up as a
# 500 to whoever was looking at the browser console. Catching it here instead means it goes
# through FastAPI's normal JSONResponse path, which CORSMiddleware still wraps, so the
# browser sees an honest 500 instead of a misleading CORS failure.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception('Unhandled exception on %s %s', request.method, request.url.path)
    return JSONResponse(status_code=500, content={'detail': 'Internal server error'})


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

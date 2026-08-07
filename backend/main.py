from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.auth import router as auth_router
from app.routers.courses import router as courses_router
from app.routers.dashboard import router as dashboard_router
from app.routers.levels import router as levels_router
from app.routers.quizzes import router as quizzes_router
from app.routers.materials import router as materials_router
from app.routers.seed_admin import router as seed_admin_router
from app.routers.notifications import router as notifications_router

app = FastAPI(title='TMAS API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,     # ← CHANGED FROM True TO False
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router)
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

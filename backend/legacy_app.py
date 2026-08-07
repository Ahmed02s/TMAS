import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

load_dotenv()

app = FastAPI(title='TMAS API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_ANON_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError('SUPABASE_URL and SUPABASE_ANON_KEY must be set')

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


class AuthRegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = 'student'


class AuthLoginRequest(BaseModel):
    email: str
    password: str


@app.get('/health')
def health() -> dict[str, Any]:
    return {'status': 'ok'}


@app.post('/api/auth/register', status_code=201)
def register(payload: AuthRegisterRequest) -> dict[str, Any]:
    try:
        response = supabase.table('users').insert({
            'id': str(uuid.uuid4()),
            'name': payload.name,
            'email': payload.email,
            'password': payload.password,
            'role': payload.role,
            'status': 'pending' if payload.role == 'lecturer' else 'active',
        }).execute()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if response.data:
        user = response.data[0]
        return {'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': user['role']}, 'token': f"{user['id']}|{user['email']}"}

    raise HTTPException(status_code=500, detail='Registration failed')


@app.post('/api/auth/login')
def login(payload: AuthLoginRequest) -> dict[str, Any]:
    response = supabase.table('users').select('*').eq('email', payload.email).eq('password', payload.password).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=401, detail='Invalid credentials')

    user = response.data[0]
    return {'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': user['role']}, 'token': f"{user['id']}|{user['email']}"}


@app.get('/api/auth/me')
def me(request: Request) -> dict[str, Any]:
    auth_header = request.headers.get('authorization', '')
    token = auth_header.replace('Bearer ', '').strip()
    if not token:
        raise HTTPException(status_code=401, detail='Unauthorized')

    user_id, email = token.split('|', 1)
    response = supabase.table('users').select('*').eq('id', user_id).eq('email', email).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=401, detail='Unauthorized')

    user = response.data[0]
    return {'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': user['role']}}


@app.get('/api/levels')
def list_levels() -> dict[str, Any]:
    response = supabase.table('levels').select('*').order('order', desc=False).execute()
    return {'levels': response.data or []}


@app.post('/api/levels', status_code=201)
def create_level(payload: dict[str, Any]) -> dict[str, Any]:
    response = supabase.table('levels').insert({
        'name': payload['name'],
        'order': payload.get('order', 1),
        'status': payload.get('status', 'active'),
    }).execute()
    return {'level': response.data[0] if response.data else {}}

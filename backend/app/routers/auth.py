import re
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_error_message, supabase_failed

router = APIRouter(prefix='/api/auth', tags=['auth'])


class AuthRegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = 'student'
    level: str | None = None
    program: str | None = None
    department: str | None = None
    index_number: str | None = None


class AuthLoginRequest(BaseModel):
    email: str
    password: str


def _build_user_payload(user: dict[str, Any]) -> dict[str, Any]:
    return {
        'id': user.get('id', user.get('email', 'demo-user')),
        'name': user.get('name', user.get('email', 'Demo User')),
        'email': user.get('email', ''),
        'role': user.get('role', 'student'),
        'status': user.get('status', 'active'),
        'level': user.get('level'),
        'program': user.get('program'),
        'department': user.get('department', user.get('dept')),
    }


@router.post('/register', status_code=201)
def register(payload: AuthRegisterRequest) -> dict[str, Any]:
    ensure_supabase_enabled()

    if payload.role == 'student' and (not payload.level or not payload.program or not payload.index_number):
        raise HTTPException(status_code=400, detail='Student registration requires index number, level, and program.')

    if payload.role not in {'student', 'lecturer', 'admin', 'administrator'}:
        raise HTTPException(status_code=400, detail='Invalid role supplied.')

    user_id = str(uuid.uuid4())
    
    insert_dict = {
        'id': user_id,
        'index_number': payload.index_number if payload.role == 'student' else None,
        'name': payload.name,
        'email': payload.email,
        'password': payload.password,
        'role': payload.role,
        'status': 'pending' if payload.role == 'lecturer' else 'active',
        'level': payload.level,
        'program': payload.program or payload.department,
        'department': payload.department or payload.program,
    }

    # Automatically adapt to schema differences if 'department' or 'program' columns don't exist in Supabase
    response = None
    while True:
        try:
            response = supabase.table('users').insert(insert_dict).execute()
            break
        except Exception as e:
            error_msg = str(e)
            if 'duplicate key' in error_msg.lower() or 'users_email_key' in error_msg or 'users_index_number_key' in error_msg:
                if 'users_index_number_key' in error_msg:
                    raise HTTPException(status_code=400, detail='This Index Number is already registered.')
                raise HTTPException(status_code=400, detail='Email already exists. Please use a different email.')
            m = re.search(r"Could not find the '([^']+)' column of '([^']+)'", error_msg)
            if m:
                missing_col = m.group(1)
                if missing_col in insert_dict:
                    insert_dict.pop(missing_col, None)
                    continue
            raise HTTPException(status_code=502, detail=f'Registration failed: {error_msg}')
    
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase register failed'))
    if response.data:
        user = response.data[0]
        return {'user': _build_user_payload(user), 'token': f"{user['id']}|{user['email']}"}
    raise HTTPException(status_code=502, detail='Supabase register returned no user')


@router.post('/login')
def login(payload: AuthLoginRequest) -> dict[str, Any]:
    ensure_supabase_enabled()
    response = supabase.table('users').select('*').eq('email', payload.email).eq('password', payload.password).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase login failed'))
    if response.data:
        user = response.data[0]
        role = str(user.get('role', 'student')).lower()
        status = str(user.get('status', 'active')).lower()
        if status == 'suspended':
            raise HTTPException(status_code=403, detail='Your account has been suspended by Administrator. Please contact support.')
        if role == 'lecturer' and status != 'active':
            if status == 'pending':
                raise HTTPException(status_code=403, detail='Lecturer account is pending administrator approval.')
            raise HTTPException(status_code=403, detail='Lecturer account is not approved.')
        return {'user': _build_user_payload(user), 'token': f"{user['id']}|{user['email']}"}
    raise HTTPException(status_code=401, detail='Invalid credentials')


@router.get('/me')
def me(request: Request) -> dict[str, Any]:
    auth_header = request.headers.get('authorization', '')
    token = auth_header.replace('Bearer ', '').strip()
    if not token:
        raise HTTPException(status_code=401, detail='Unauthorized')

    try:
        user_id, email = token.split('|', 1)
    except ValueError:
        raise HTTPException(status_code=401, detail='Unauthorized')

    ensure_supabase_enabled()
    response = supabase.table('users').select('*').eq('id', user_id).eq('email', email).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase auth failed'))
    if response.data:
        user = response.data[0]
        return {'user': _build_user_payload(user)}
    raise HTTPException(status_code=401, detail='Unauthorized')
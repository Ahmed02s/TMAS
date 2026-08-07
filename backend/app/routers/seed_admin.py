import os
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message

router = APIRouter(prefix='/api/admin', tags=['admin'])


class SeedRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: str
    institution: str | None = None


@router.post('/seed-superadmin')
def seed_superadmin(payload: SeedRequest, x_seed_token: str | None = Header(None, alias='X-SEED-TOKEN')) -> dict[str, Any]:
    secret = os.getenv('SEED_SECRET')
    if not secret:
        raise HTTPException(status_code=403, detail='Seed endpoint disabled (no SEED_SECRET configured)')
    if not x_seed_token or x_seed_token != secret:
        raise HTTPException(status_code=403, detail='Invalid seed token')

    full_name = f"{payload.first_name.strip()} {payload.last_name.strip()}"
    ensure_supabase_enabled()

    response = supabase.table('users').insert({
        'id': str(uuid.uuid4()),
        'name': full_name,
        'email': payload.email,
        'password': payload.password,
        'role': 'administrator',
        'status': 'active',
        'institution': payload.institution,
    }).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase seed failed'))
    if response.data:
        user = response.data[0]
        return {
            'user': {
                'id': user.get('id'),
                'name': user.get('name'),
                'email': user.get('email'),
                'role': user.get('role'),
            },
            'token': f"{user['id']}|{user['email']}",
        }
    raise HTTPException(status_code=502, detail='Supabase seed returned no user')

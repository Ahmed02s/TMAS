import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message

router = APIRouter(prefix='/api/levels', tags=['levels'])


@router.get('')
def list_levels() -> dict[str, Any]:
    ensure_supabase_enabled()
    response = supabase.table('levels').select('*').order('order', desc=False).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase list levels failed'))
    return {'levels': response.data or []}


@router.post('', status_code=201)
def create_level(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_supabase_enabled()
    response = supabase.table('levels').insert({
        'id': str(uuid.uuid4()),
        'name': payload['name'],
        'order': payload.get('order', 1),
        'status': payload.get('status', 'active'),
    }).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase create level failed'))
    if response.data:
        return {'level': response.data[0]}
    raise HTTPException(status_code=502, detail='Supabase create level returned no level')


@router.patch('/{level_id}')
def update_level(level_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    ensure_supabase_enabled()
    allowed = {'name', 'status', 'order'}
    record = {k: payload[k] for k in payload.keys() if k in allowed}
    if not record:
        raise HTTPException(status_code=400, detail='No updatable fields provided')

    response = supabase.table('levels').update(record).eq('id', level_id).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase update level failed'))
    if response.data:
        return {'level': response.data[0]}
    raise HTTPException(status_code=404, detail='Level not found')

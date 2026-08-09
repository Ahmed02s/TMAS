import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.security import require_roles
from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message

router = APIRouter(prefix='/api/levels', tags=['levels'])

_VALID_LEVEL_STATUSES = {'active', 'archived', 'inactive'}


class CreateLevelRequest(BaseModel):
    name: str
    order: int = Field(default=1, ge=1)
    status: str = 'active'

    @field_validator('name')
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Level name is required')
        return v

    @field_validator('status')
    @classmethod
    def _valid_status(cls, v: str) -> str:
        if v not in _VALID_LEVEL_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_LEVEL_STATUSES)}")
        return v


class UpdateLevelRequest(BaseModel):
    name: str | None = None
    order: int | None = Field(default=None, ge=1)
    status: str | None = None

    @field_validator('name')
    @classmethod
    def _not_blank_if_present(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError('Level name cannot be blank')
        return v

    @field_validator('status')
    @classmethod
    def _valid_status_if_present(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_LEVEL_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_LEVEL_STATUSES)}")
        return v


@router.get('')
def list_levels() -> dict[str, Any]:
    ensure_supabase_enabled()
    response = supabase.table('levels').select('*').order('order', desc=False).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase list levels failed'))
    return {'levels': response.data or []}


@router.post('', status_code=201)
def create_level(payload: CreateLevelRequest, _claims: dict = Depends(require_roles('admin', 'administrator'))) -> dict[str, Any]:
    ensure_supabase_enabled()
    response = supabase.table('levels').insert({
        'id': str(uuid.uuid4()),
        'name': payload.name,
        'order': payload.order,
        'status': payload.status,
    }).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase create level failed'))
    if response.data:
        return {'level': response.data[0]}
    raise HTTPException(status_code=502, detail='Supabase create level returned no level')


@router.patch('/{level_id}')
def update_level(level_id: str, payload: UpdateLevelRequest, _claims: dict = Depends(require_roles('admin', 'administrator'))) -> dict[str, Any]:
    ensure_supabase_enabled()
    record = payload.model_dump(exclude_unset=True)
    if not record:
        raise HTTPException(status_code=400, detail='No updatable fields provided')

    response = supabase.table('levels').update(record).eq('id', level_id).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase update level failed'))
    if response.data:
        return {'level': response.data[0]}
    raise HTTPException(status_code=404, detail='Level not found')

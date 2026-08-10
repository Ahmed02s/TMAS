import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, field_validator

from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_error_message, supabase_failed

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/contact', tags=['contact'])


class ContactMessageRequest(BaseModel):
    name: str
    email: EmailStr
    message: str

    @field_validator('name')
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Name is required')
        return v

    @field_validator('message')
    @classmethod
    def _message_not_blank(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError('Message is too short')
        return v


@router.post('', status_code=201)
def send_contact_message(payload: ContactMessageRequest) -> dict[str, Any]:
    """Landing page 'Send us a message' form. No outbound email provider is configured, so
    the message is persisted for an admin to review — this at minimum makes the form
    genuinely capture what a visitor submits instead of silently doing nothing."""
    ensure_supabase_enabled()
    record = {
        'name': payload.name,
        'email': payload.email,
        'message': payload.message.strip(),
        'status': 'new',
    }
    # A raw, unhandled exception here (e.g. the table not existing) crashes hard enough to
    # bypass CORSMiddleware entirely — Starlette's outer safety net returns a response with
    # no CORS headers at all, which the browser reports as "blocked by CORS policy" and
    # completely hides the real error. Converting any failure into an HTTPException keeps it
    # inside FastAPI's normal response path, so the browser gets an honest error instead of a
    # misleading CORS failure.
    try:
        response = supabase.table('contact_messages').insert(record).execute()
    except Exception as exc:
        logger.exception('send_contact_message: insert failed')
        raise HTTPException(status_code=502, detail=f'Could not send message: {exc}')
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase insert contact message failed'))
    return {'status': 'received', 'message': "Thanks — we've received your message and will get back to you soon."}

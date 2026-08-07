from typing import Any

from fastapi import HTTPException

from app.core.config import SUPABASE_ANON_KEY, SUPABASE_URL

try:
    from supabase import Client, create_client
except Exception:
    Client = Any  # type: ignore
    create_client = None  # type: ignore


supabase: Any | None = None
if create_client is not None and SUPABASE_URL and SUPABASE_ANON_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def _is_supabase_enabled() -> bool:
    return supabase is not None


def ensure_supabase_enabled() -> None:
    if not _is_supabase_enabled():
        raise HTTPException(status_code=503, detail='Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the environment.')


def supabase_failed(response: Any) -> bool:
    if response is None:
        return True
    if getattr(response, 'error', None):
        return True
    status = getattr(response, 'status_code', None) or getattr(response, 'status', None)
    return isinstance(status, int) and status >= 400


def supabase_error_message(response: Any, default: str) -> str:
    error = getattr(response, 'error', None)
    if error:
        return str(error)
    status = getattr(response, 'status_code', None) or getattr(response, 'status', None)
    if status is not None:
        return f"{default} (status={status})"
    return default

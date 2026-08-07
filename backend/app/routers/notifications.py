import datetime
from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message

router = APIRouter(prefix='/api/notifications', tags=['notifications'])

# In-memory notifications cache for instant real-time dispatch and offline fallback
_NOTIFICATIONS_DB: list[dict[str, Any]] = [
    {
        'id': 'notif-1',
        'target_role': 'admin',
        'user_id': None,
        'title': 'Welcome to TMAS Admin',
        'message': 'System is initialized and monitoring all academic structures.',
        'type': 'system',
        'read': False,
        'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    },
    {
        'id': 'notif-2',
        'target_role': 'lecturer',
        'user_id': None,
        'title': 'Lecturer Portal Active',
        'message': 'You can generate AI quizzes and upload lecture materials.',
        'type': 'info',
        'read': False,
        'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    },
    {
        'id': 'notif-3',
        'target_role': 'student',
        'user_id': None,
        'title': 'Welcome to TMAS LMS',
        'message': 'Check your enrolled courses and upcoming 3-tier quizzes.',
        'type': 'info',
        'read': False,
        'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    },
]


class CreateNotificationRequest(BaseModel):
    title: str
    message: str
    target_role: str = Field(default='all')  # 'all', 'student', 'lecturer', 'admin'
    user_id: str | None = None
    type: str = Field(default='info')  # 'info', 'success', 'warning', 'danger'


class MarkReadRequest(BaseModel):
    notification_ids: list[str] = Field(default_factory=list)


@router.get('')
def get_notifications(role: str = 'all', user_id: str | None = None) -> dict[str, Any]:
    ensure_supabase_enabled()

    # Try fetching from Supabase table 'notifications' if present
    try:
        query = supabase.table('notifications').select('*')
        if role != 'all':
            query = query.or_(f"target_role.eq.{role},target_role.eq.all")
        if user_id:
            query = query.or_(f"user_id.eq.{user_id},user_id.is.null")
        resp = query.order('created_at', desc=True).limit(50).execute()
        if not supabase_failed(resp) and resp.data:
            return {'notifications': resp.data}
    except Exception:
        pass

    # In-memory fallback
    filtered = []
    for n in reversed(_NOTIFICATIONS_DB):
        if n['target_role'] in ('all', role) or (user_id and n['user_id'] == user_id):
            filtered.append(n)

    return {'notifications': filtered}


@router.post('')
def send_notification(payload: CreateNotificationRequest) -> dict[str, Any]:
    ensure_supabase_enabled()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record = {
        'id': f"notif-{len(_NOTIFICATIONS_DB) + 1}",
        'title': payload.title,
        'message': payload.message,
        'target_role': payload.target_role,
        'user_id': payload.user_id,
        'type': payload.type,
        'read': False,
        'created_at': now_iso,
    }

    _NOTIFICATIONS_DB.append(record)

    try:
        resp = supabase.table('notifications').insert(record).execute()
        if not supabase_failed(resp) and resp.data:
            return {'notification': resp.data[0]}
    except Exception as e:
        print(f"Supabase notifications table insert fallback to memory: {e}")

    return {'notification': record}


@router.post('/read')
def mark_notifications_read(payload: MarkReadRequest) -> dict[str, Any]:
    ensure_supabase_enabled()
    if not payload.notification_ids:
        # Mark all in-memory as read
        for n in _NOTIFICATIONS_DB:
            n['read'] = True
        return {'status': 'success'}

    for n in _NOTIFICATIONS_DB:
        if n['id'] in payload.notification_ids:
            n['read'] = True

    try:
        supabase.table('notifications').update({'read': True}).in_('id', payload.notification_ids).execute()
    except Exception:
        pass

    return {'status': 'success'}

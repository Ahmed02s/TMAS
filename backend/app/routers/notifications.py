import datetime
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.authorization import normalize_course_code, require_lecturer_course
from app.core.security import get_current_principal
from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/notifications', tags=['notifications'])

# Development fallback only. Production notifications are stored as one row per recipient.
_NOTIFICATIONS_DB: list[dict[str, Any]] = []


class CreateNotificationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=4000)
    target_role: str = Field(default='all')
    user_id: str | None = None
    type: str = Field(default='info', max_length=50)
    course: str | None = None

    @field_validator('target_role')
    @classmethod
    def valid_target_role(cls, value: str) -> str:
        value = value.lower()
        if value not in {'all', 'student', 'lecturer', 'admin', 'administrator'}:
            raise ValueError('Invalid notification target role')
        return value


class MarkReadRequest(BaseModel):
    notification_ids: list[int] = Field(default_factory=list, max_length=100)


def _public_notification(row: dict[str, Any]) -> dict[str, Any]:
    """Keep the existing frontend contract while using the live database column names."""
    return {
        **row,
        'type': row.get('notification_type', row.get('type', 'info')),
        'read': bool(row.get('is_read', row.get('read', False))),
    }


@router.get('')
def get_notifications(
    role: str = 'all',
    user_id: str | None = None,
    claims: dict = Depends(get_current_principal),
) -> dict[str, Any]:
    principal_id = str(claims.get('sub') or '')
    if user_id and user_id != principal_id:
        raise HTTPException(status_code=403, detail='You can only view your own notifications')
    # `role` remains accepted for older web clients, but never controls the database scope.
    if role not in ('all', str(claims.get('role') or '').lower()):
        raise HTTPException(status_code=403, detail='You can only view notifications for your own role')

    ensure_supabase_enabled()
    try:
        response = (
            supabase.table('notifications').select('*').eq('user_id', principal_id)
            .order('created_at', desc=True).limit(50).execute()
        )
        if supabase_failed(response):
            raise RuntimeError('Notification query failed')
        return {'notifications': [_public_notification(row) for row in (response.data or [])]}
    except Exception:
        logger.exception('get_notifications: database fetch failed, using development fallback')
        return {
            'notifications': [
                _public_notification(row) for row in reversed(_NOTIFICATIONS_DB)
                if str(row.get('user_id')) == principal_id
            ]
        }


def _recipient_ids(payload: CreateNotificationRequest, claims: dict[str, Any]) -> list[str]:
    role = str(claims.get('role') or '').lower()
    if role == 'lecturer':
        if not payload.course:
            raise HTTPException(status_code=400, detail='course is required for lecturer notifications')
        if payload.user_id or payload.target_role != 'student':
            raise HTTPException(status_code=403, detail='Lecturers may notify only students in an assigned course')
        require_lecturer_course(claims, payload.course)
        courses = supabase.table('courses').select('id,code').execute()
        course = next(
            (row for row in (courses.data or []) if normalize_course_code(row.get('code')) == normalize_course_code(payload.course)),
            None,
        )
        if not course:
            raise HTTPException(status_code=404, detail='Course not found')
        enrollments = supabase.table('course_enrollments').select('student_id').eq(
            'course_id', course['id']
        ).in_('status', ['active', 'completed']).execute()
        return [str(row['student_id']) for row in (enrollments.data or []) if row.get('student_id')]

    if role not in ('admin', 'administrator'):
        raise HTTPException(status_code=403, detail='You cannot create system notifications')
    if payload.user_id:
        user = supabase.table('users').select('id').eq('id', payload.user_id).limit(1).execute()
        if not user.data:
            raise HTTPException(status_code=404, detail='Notification recipient not found')
        return [str(payload.user_id)]
    users = supabase.table('users').select('id,role').execute()
    target_roles = {'admin', 'administrator'} if payload.target_role in {'admin', 'administrator'} else {payload.target_role}
    return [
        str(row['id']) for row in (users.data or [])
        if row.get('id') and (payload.target_role == 'all' or str(row.get('role') or '').lower() in target_roles)
    ]


@router.post('')
def send_notification(payload: CreateNotificationRequest, claims: dict = Depends(get_current_principal)) -> dict[str, Any]:
    recipient_ids = sorted(set(_recipient_ids(payload, claims)))
    ensure_supabase_enabled()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    records = [
        {
            'user_id': recipient_id,
            'notification_type': payload.type,
            'title': payload.title,
            'message': payload.message,
            'created_at': now_iso,
        }
        for recipient_id in recipient_ids
    ]
    if not records:
        return {'notifications_created': 0, 'notifications': [], 'notification': None}
    response = supabase.table('notifications').insert(records).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail='Failed to create notifications')
    public_rows = [_public_notification(row) for row in (response.data or records)]
    return {
        'notifications_created': len(response.data or records),
        'notifications': public_rows,
        # Backward compatibility for callers that expected the former single-row response.
        'notification': public_rows[0],
    }


@router.post('/read')
def mark_notifications_read(payload: MarkReadRequest, claims: dict = Depends(get_current_principal)) -> dict[str, Any]:
    ensure_supabase_enabled()
    if not payload.notification_ids:
        raise HTTPException(status_code=400, detail='notification_ids is required')
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    # Ownership is part of the UPDATE predicate: knowing another row ID is insufficient.
    response = (
        supabase.table('notifications').update({'is_read': True, 'read_at': now_iso})
        .in_('id', payload.notification_ids).eq('user_id', claims['sub']).execute()
    )
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail='Failed to update notifications')
    return {'status': 'success', 'updated': len(response.data or [])}

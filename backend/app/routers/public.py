from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_error_message, supabase_failed

router = APIRouter(prefix='/api/public', tags=['public'])


@router.get('/platform-stats')
def platform_stats() -> dict[str, Any]:
    """Return non-sensitive, database-backed figures for public marketing pages."""
    ensure_supabase_enabled()

    users_response = supabase.table('users').select('role,status,institution').execute()
    courses_response = supabase.table('courses').select('status').execute()
    attempts_response = supabase.table('quiz_attempts').select('score,status').execute()

    for response, message in (
        (users_response, 'Supabase public user statistics failed'),
        (courses_response, 'Supabase public course statistics failed'),
        (attempts_response, 'Supabase public quiz statistics failed'),
    ):
        if supabase_failed(response):
            raise HTTPException(status_code=502, detail=supabase_error_message(response, message))

    users = users_response.data or []
    courses = courses_response.data or []
    attempts = attempts_response.data or []

    active_students = sum(
        1 for user in users
        if str(user.get('role') or '').strip().lower() == 'student'
        and str(user.get('status') or 'active').strip().lower() == 'active'
    )
    active_courses = sum(
        1 for course in courses
        if str(course.get('status') or 'active').strip().lower() == 'active'
    )
    institutions = {
        str(user.get('institution')).strip().casefold()
        for user in users
        if str(user.get('institution') or '').strip()
        and str(user.get('status') or 'active').strip().lower() == 'active'
    }
    completed_scores = [
        float(attempt.get('score') or 0)
        for attempt in attempts
        if str(attempt.get('status') or 'completed').strip().lower() == 'completed'
    ]

    return {
        'registered_students': active_students,
        'active_courses': active_courses,
        'average_quiz_score': round(sum(completed_scores) / len(completed_scores)) if completed_scores else None,
        'institutions_represented': len(institutions),
    }

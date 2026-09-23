import re
from typing import Any

from fastapi import HTTPException

from app.core.supabase_client import supabase, supabase_failed, supabase_error_message


def normalize_course_code(value: Any) -> str:
    return re.sub(r'[^a-z0-9]', '', str(value or '').lower())


def lecturer_course_codes(claims: dict[str, Any]) -> set[str]:
    user_response = supabase.table('users').select('name,status').eq('id', claims.get('sub')).limit(1).execute()
    if supabase_failed(user_response) or not user_response.data:
        raise HTTPException(status_code=403, detail='Lecturer profile could not be verified')
    user = user_response.data[0]
    if str(user.get('status') or '').lower() != 'active':
        raise HTTPException(status_code=403, detail='Lecturer account is not active')
    lecturer_name = str(user.get('name') or '').strip()
    if not lecturer_name:
        raise HTTPException(status_code=403, detail='Lecturer profile could not be verified')
    # Explicit assignment is authoritative once the migration table exists.
    try:
        assignments = supabase.table('course_lecturers').select('course_id').eq('lecturer_id', claims.get('sub')).execute()
        if not supabase_failed(assignments):
            course_ids = [row.get('course_id') for row in (assignments.data or []) if row.get('course_id') is not None]
            if not course_ids:
                return set()
            courses_response = supabase.table('courses').select('code').in_('id', course_ids).execute()
            if supabase_failed(courses_response):
                raise HTTPException(status_code=502, detail=supabase_error_message(courses_response, 'Failed to load assigned courses'))
            return {normalize_course_code(course.get('code')) for course in (courses_response.data or []) if course.get('code')}
    except HTTPException:
        raise
    except Exception:
        # Compatibility only until the assignment migration is deployed.
        pass

    courses_response = supabase.table('courses').select('code').ilike('lecturer', f'%{lecturer_name}%').execute()
    if supabase_failed(courses_response):
        raise HTTPException(status_code=502, detail=supabase_error_message(courses_response, 'Failed to verify lecturer courses'))
    return {normalize_course_code(course.get('code')) for course in (courses_response.data or []) if course.get('code')}


def require_lecturer_course(claims: dict[str, Any], course_code: Any) -> None:
    if str(claims.get('role') or '').lower() != 'lecturer':
        raise HTTPException(status_code=403, detail='Only lecturers assigned to this course can perform this action')
    normalized = normalize_course_code(course_code)
    if not normalized or normalized not in lecturer_course_codes(claims):
        raise HTTPException(status_code=403, detail='You can access only courses assigned to you')


def require_course_mutation_access(claims: dict[str, Any], course_code: Any, *, allow_admin: bool = False) -> None:
    if allow_admin and str(claims.get('role') or '').lower() in ('admin', 'administrator'):
        return
    require_lecturer_course(claims, course_code)


def require_course_access(principal: dict[str, Any], course_code: Any) -> None:
    """Authorize access to course-owned content using the authoritative principal."""
    role = str(principal.get('role') or '').lower()
    if role in ('admin', 'administrator'):
        return
    if role == 'lecturer':
        require_lecturer_course(principal, course_code)
        return
    if role != 'student':
        raise HTTPException(status_code=403, detail='You do not have access to this course')

    normalized = normalize_course_code(course_code)
    course_response = supabase.table('courses').select('id,code,level,program').execute()
    if supabase_failed(course_response):
        raise HTTPException(status_code=502, detail='Failed to verify course access')
    course = next(
        (row for row in (course_response.data or []) if normalize_course_code(row.get('code')) == normalized),
        None,
    )
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    try:
        enrollment = supabase.table('course_enrollments').select('id').eq(
            'course_id', course['id']
        ).eq('student_id', principal.get('sub')).in_('status', ['active', 'completed']).limit(1).execute()
        if not supabase_failed(enrollment):
            if enrollment.data:
                return
            raise HTTPException(status_code=403, detail='You are not enrolled in this course')
    except HTTPException:
        raise
    except Exception:
        # Compatibility for deployments awaiting the explicit-enrollment migration.
        same_level = str(principal.get('level') or '').strip().lower() == str(course.get('level') or '').strip().lower()
        course_program = str(course.get('program') or '').strip().lower()
        same_program = not course_program or course_program == str(principal.get('program') or '').strip().lower()
        if same_level and same_program:
            return
    raise HTTPException(status_code=403, detail='You are not enrolled in this course')

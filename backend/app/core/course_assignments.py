import logging
from typing import Any

from app.core.supabase_client import supabase, supabase_failed

logger = logging.getLogger(__name__)


def academic_match(level: Any, program: Any, course_level: Any, course_program: Any) -> bool:
    """Current TMAS enrollment rule, centralized for lifecycle synchronization."""
    student_level = str(level or '').strip().lower()
    student_program = str(program or '').strip().lower()
    required_level = str(course_level or '').strip().lower()
    required_program = str(course_program or '').strip().lower()
    return bool(required_level and student_level == required_level) and (
        not required_program or student_program == required_program
    )


def _reconcile_enrollments(student_id: str, desired_course_ids: set[Any]) -> bool:
    try:
        response = supabase.table('course_enrollments').select('course_id,status').eq('student_id', student_id).execute()
        if supabase_failed(response):
            return False
        existing = {row.get('course_id'): str(row.get('status') or 'active') for row in (response.data or [])}
        for course_id in desired_course_ids:
            status = existing.get(course_id)
            if status is None:
                supabase.table('course_enrollments').insert({
                    'course_id': course_id, 'student_id': student_id, 'status': 'active',
                }).execute()
            elif status == 'withdrawn':
                supabase.table('course_enrollments').update({'status': 'active'}) \
                    .eq('course_id', course_id).eq('student_id', student_id).execute()
        for course_id, status in existing.items():
            if course_id not in desired_course_ids and status == 'active':
                supabase.table('course_enrollments').update({'status': 'withdrawn'}) \
                    .eq('course_id', course_id).eq('student_id', student_id).execute()
        return True
    except Exception:
        logger.info('course_enrollments unavailable; assignment synchronization skipped')
        return False


def sync_student_enrollments(student_id: str, level: Any, program: Any) -> bool:
    try:
        response = supabase.table('courses').select('id,level,program').execute()
        if supabase_failed(response):
            return False
        desired = {
            course.get('id') for course in (response.data or [])
            if course.get('id') is not None and academic_match(level, program, course.get('level'), course.get('program'))
        }
        return _reconcile_enrollments(student_id, desired)
    except Exception:
        logger.exception('Could not synchronize enrollments for student=%s', student_id)
        return False


def sync_course_enrollments(course: dict[str, Any]) -> bool:
    course_id = course.get('id')
    if course_id is None:
        return False
    try:
        users_response = supabase.table('users').select('id,level,program').eq('role', 'student').execute()
        if supabase_failed(users_response):
            return False
        desired_students = {
            str(student.get('id')) for student in (users_response.data or [])
            if student.get('id') is not None and academic_match(
                student.get('level'), student.get('program'), course.get('level'), course.get('program')
            )
        }
        existing_response = supabase.table('course_enrollments').select('student_id,status').eq('course_id', course_id).execute()
        if supabase_failed(existing_response):
            return False
        existing = {str(row.get('student_id')): str(row.get('status') or 'active') for row in (existing_response.data or [])}
        for student_id in desired_students:
            if student_id not in existing:
                supabase.table('course_enrollments').insert({
                    'course_id': course_id, 'student_id': student_id, 'status': 'active',
                }).execute()
            elif existing[student_id] == 'withdrawn':
                supabase.table('course_enrollments').update({'status': 'active'}) \
                    .eq('course_id', course_id).eq('student_id', student_id).execute()
        for student_id, status in existing.items():
            if student_id not in desired_students and status == 'active':
                supabase.table('course_enrollments').update({'status': 'withdrawn'}) \
                    .eq('course_id', course_id).eq('student_id', student_id).execute()
        return True
    except Exception:
        logger.info('course_enrollments unavailable; course synchronization skipped')
        return False


def sync_course_lecturers(course: dict[str, Any]) -> bool:
    course_id = course.get('id')
    if course_id is None:
        return False
    names = {name.strip().lower() for name in str(course.get('lecturer') or '').split(',') if name.strip()}
    try:
        users_response = supabase.table('users').select('id,name').eq('role', 'lecturer').execute()
        if supabase_failed(users_response):
            return False
        desired = {
            str(user.get('id')) for user in (users_response.data or [])
            if user.get('id') is not None and str(user.get('name') or '').strip().lower() in names
        }
        existing_response = supabase.table('course_lecturers').select('lecturer_id').eq('course_id', course_id).execute()
        if supabase_failed(existing_response):
            return False
        existing = {str(row.get('lecturer_id')) for row in (existing_response.data or [])}
        for lecturer_id in desired - existing:
            supabase.table('course_lecturers').insert({'course_id': course_id, 'lecturer_id': lecturer_id}).execute()
        for lecturer_id in existing - desired:
            supabase.table('course_lecturers').delete().eq('course_id', course_id).eq('lecturer_id', lecturer_id).execute()
        return True
    except Exception:
        logger.info('course_lecturers unavailable; lecturer synchronization skipped')
        return False

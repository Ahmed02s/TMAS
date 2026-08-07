from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message

router = APIRouter(prefix='/api/dashboard', tags=['dashboard'])


@router.get('/students')
def list_students(level: str | None = None, program: str | None = None, lecturer: str | None = None) -> dict[str, Any]:
    ensure_supabase_enabled()
    query = supabase.table('users').select('*').eq('role', 'student')
    if level:
        query = query.ilike('level', level)

    response = query.execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase list students failed'))

    students = response.data or []
    if program:
        normalized_program = program.strip().lower()
        students = [student for student in students if not str(student.get('program') or '').strip() or str(student.get('program') or '').strip().lower() == normalized_program]
    if lecturer:
        lecturer = lecturer.strip()
        if lecturer:
            course_resp = supabase.table('courses').select('level,program').ilike('lecturer', lecturer).execute()
            if supabase_failed(course_resp):
                raise HTTPException(status_code=502, detail=supabase_error_message(course_resp, 'Supabase list lecturer courses failed'))

            course_pairs = {(course.get('level'), course.get('program')) for course in (course_resp.data or [])}
            students = [student for student in students if (student.get('level'), student.get('program')) in course_pairs]

    return {'students': students}


@router.get('/lecturers')
def list_lecturers() -> dict[str, Any]:
    ensure_supabase_enabled()
    response = supabase.table('users').select('*').eq('role', 'lecturer').execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase list lecturers failed'))
    return {'lecturers': response.data or []}


@router.patch('/lecturers/{lecturer_id}/status')
def update_lecturer_status(lecturer_id: str, payload: dict[str, str]) -> dict[str, Any]:
    ensure_supabase_enabled()
    status = payload.get('status')
    if status not in {'active', 'rejected', 'suspended'}:
        raise HTTPException(status_code=400, detail='Invalid lecturer status')

    response = supabase.table('users').update({'status': status}).eq('id', lecturer_id).eq('role', 'lecturer').execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase update lecturer status failed'))
    if response.data:
        return {'lecturer': response.data[0]}
    raise HTTPException(status_code=404, detail='Lecturer not found')


@router.patch('/students/{student_id}')
def update_student(student_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Update student fields such as status, level, name or email."""
    ensure_supabase_enabled()
    allowed = {'status', 'level', 'name', 'email', 'program', 'institution'}
    record = {k: payload[k] for k in payload.keys() if k in allowed}
    if not record:
        raise HTTPException(status_code=400, detail='No updatable fields provided')

    response = supabase.table('users').update(record).eq('id', student_id).eq('role', 'student').execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase update student failed'))
    if response.data:
        return {'student': response.data[0]}
    raise HTTPException(status_code=404, detail='Student not found')

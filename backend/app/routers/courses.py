from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message

router = APIRouter(prefix='/api/courses', tags=['courses'])


def _course_matches_level_program(course: dict[str, Any], level: str | None, program: str | None) -> bool:
    if level:
        course_level = str(course.get('level') or '').strip().lower()
        if course_level != level.strip().lower():
            return False
    if program:
        course_program = str(course.get('program') or '').strip().lower()
        if course_program and course_program != program.strip().lower():
            return False
    return True


@router.get('')
def list_courses(level: str | None = None, program: str | None = None, lecturer: str | None = None, status: str | None = None) -> dict[str, Any]:
    ensure_supabase_enabled()
    query = supabase.table('courses').select('*')
    if level:
        query = query.ilike('level', f"%{level}%")
    if lecturer:
        lecturer = lecturer.strip()
        if lecturer:
            query = query.ilike('lecturer', f"%{lecturer}%")
    if status:
        query = query.eq('status', status)

    response = query.execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase list courses failed'))

    courses = response.data or []
    if level or program:
        courses = [course for course in courses if _course_matches_level_program(course, level, program)]
    return {'courses': courses}


@router.post('', status_code=201)
def create_course(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_supabase_enabled()
    # allowed fields for creation
    record = {
        'code': payload.get('code'),
        'title': payload.get('title'),
        'level': payload.get('level'),
        'program': payload.get('program'),
        'lecturer': payload.get('lecturer'),
        'progress': int(payload.get('progress', 0)),
        'materials': int(payload.get('materials', 0)),
        'quizzes_total': int(payload.get('quizzes_total', 0)),
        'quizzes_done': int(payload.get('quizzes_done', 0)),
        'avg_score': int(payload.get('avg_score', 0)),
        'color': payload.get('color'),
        'status': payload.get('status', 'active'),
    }
    response = supabase.table('courses').insert(record).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase create course failed'))
    if response.data:
        return {'course': response.data[0]}
    raise HTTPException(status_code=502, detail='Supabase create course returned no course')


@router.patch('/{course_id}')
def update_course(course_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    ensure_supabase_enabled()
    # filter allowed update fields
    allowed = {'code','title','level','program','lecturer','progress','materials','quizzes_total','quizzes_done','avg_score','color','status'}
    record = {k: payload[k] for k in payload.keys() if k in allowed}
    if not record:
        raise HTTPException(status_code=400, detail='No updatable fields provided')
    # coerce numeric fields if present
    for num in ('progress','materials','quizzes_total','quizzes_done','avg_score'):
        if num in record:
            try:
                record[num] = int(record[num])
            except Exception:
                record[num] = 0

    response = supabase.table('courses').update(record).eq('id', course_id).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase update course failed'))
    if response.data:
        return {'course': response.data[0]}
    raise HTTPException(status_code=404, detail='Course not found')


@router.delete('/{course_id}', status_code=204)
def delete_course(course_id: str):
    ensure_supabase_enabled()
    response = supabase.table('courses').delete().eq('id', course_id).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase delete course failed'))
    return {}

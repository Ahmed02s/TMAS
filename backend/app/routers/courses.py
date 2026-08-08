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
def list_courses(
    level: str | None = None,
    program: str | None = None,
    lecturer: str | None = None,
    status: str | None = None,
    student_id: str | None = None,
) -> dict[str, Any]:
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

    if not courses:
        return {'courses': courses}

    # ── Enrich each course with live stats ──────────────────────────────
    course_codes = [c.get('code') for c in courses if c.get('code')]

    # 1. Materials count per course code
    materials_by_course: dict[str, int] = {}
    try:
        mat_resp = supabase.table('materials').select('course').in_('course', course_codes).execute()
        if not supabase_failed(mat_resp):
            for m in mat_resp.data or []:
                code = m.get('course', '')
                materials_by_course[code] = materials_by_course.get(code, 0) + 1
    except Exception:
        pass

    # 2. Quiz stats per course (total quizzes published)
    quizzes_total_by_course: dict[str, int] = {}
    quiz_ids_by_course: dict[str, list[int]] = {}
    try:
        q_resp = supabase.table('quizzes').select('id,course').in_('course', course_codes).execute()
        if not supabase_failed(q_resp):
            for q in q_resp.data or []:
                code = q.get('course', '')
                qid = q.get('id')
                quizzes_total_by_course[code] = quizzes_total_by_course.get(code, 0) + 1
                if qid is not None:
                    quiz_ids_by_course.setdefault(code, []).append(qid)
    except Exception:
        pass

    # 3. Student-specific quiz attempt stats
    quizzes_done_by_course: dict[str, int] = {}
    avg_score_by_course: dict[str, float] = {}
    if student_id:
        all_quiz_ids = [qid for ids in quiz_ids_by_course.values() for qid in ids]
        if all_quiz_ids:
            try:
                att_resp = supabase.table('quiz_attempts').select('quiz_id,score,status') \
                    .eq('student_id', student_id) \
                    .in_('quiz_id', all_quiz_ids) \
                    .execute()
                if not supabase_failed(att_resp):
                    # Build reverse lookup: quiz_id → course_code
                    qid_to_course = {qid: code for code, ids in quiz_ids_by_course.items() for qid in ids}
                    scores_by_course: dict[str, list[float]] = {}
                    done_quiz_ids: set[int] = set()
                    for att in att_resp.data or []:
                        if att.get('status') not in ('completed', 'missed'):
                            continue
                        qid = att.get('quiz_id')
                        code = qid_to_course.get(qid, '')
                        if not code:
                            continue
                        if qid not in done_quiz_ids:
                            done_quiz_ids.add(qid)
                            quizzes_done_by_course[code] = quizzes_done_by_course.get(code, 0) + 1
                        scores_by_course.setdefault(code, []).append(float(att.get('score', 0)))
                    for code, scores in scores_by_course.items():
                        avg_score_by_course[code] = round(sum(scores) / len(scores)) if scores else 0
            except Exception:
                pass

    # 4. Student count per course (match by level + program, case-insensitive)
    students_by_course: dict[str, int] = {}
    try:
        stu_resp = supabase.table('users').select('level,program').eq('role', 'student').execute()
        if not supabase_failed(stu_resp):
            for stu in stu_resp.data or []:
                stu_level = str(stu.get('level') or '').strip().lower()
                stu_program = str(stu.get('program') or '').strip().lower()
                for course in courses:
                    c_level = str(course.get('level') or '').strip().lower()
                    c_program = str(course.get('program') or '').strip().lower()
                    if c_level and c_level == stu_level and (not c_program or c_program == stu_program):
                        code = course.get('code', '')
                        students_by_course[code] = students_by_course.get(code, 0) + 1
    except Exception:
        pass

    # Apply enriched stats to each course
    for course in courses:
        code = course.get('code', '')
        mat_count = materials_by_course.get(code, course.get('materials', 0))
        course['materials'] = mat_count
        course['quizzes_total'] = quizzes_total_by_course.get(code, course.get('quizzes_total', 0))
        course['student_count'] = students_by_course.get(code, 0)
        if student_id:
            course['quizzes_done'] = quizzes_done_by_course.get(code, 0)
            course['avg_score'] = avg_score_by_course.get(code, 0)

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

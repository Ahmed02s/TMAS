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

    # 3b. Class-wide quiz attempt stats — used for the lecturer's aggregate view (average
    # score and completion rate across ALL enrolled students, not just one). Without this,
    # a lecturer's "Avg Quiz Score" / course completion bar just echoed a static DB column
    # that nothing ever updates, instead of reflecting real student performance.
    class_avg_score_by_course: dict[str, float] = {}
    class_completed_by_course: dict[str, int] = {}
    all_quiz_ids_flat = [qid for ids in quiz_ids_by_course.values() for qid in ids]
    if all_quiz_ids_flat:
        try:
            class_att_resp = supabase.table('quiz_attempts').select('quiz_id,student_id,score,status') \
                .in_('quiz_id', all_quiz_ids_flat) \
                .execute()
            if not supabase_failed(class_att_resp):
                qid_to_course_class = {qid: code for code, ids in quiz_ids_by_course.items() for qid in ids}
                class_scores_by_course: dict[str, list[float]] = {}
                for att in class_att_resp.data or []:
                    if att.get('status') not in ('completed', 'missed'):
                        continue
                    code = qid_to_course_class.get(att.get('quiz_id'), '')
                    if not code:
                        continue
                    class_completed_by_course[code] = class_completed_by_course.get(code, 0) + 1
                    if att.get('status') == 'completed':
                        class_scores_by_course.setdefault(code, []).append(float(att.get('score', 0)))
                for code, scores in class_scores_by_course.items():
                    class_avg_score_by_course[code] = round(sum(scores) / len(scores)) if scores else 0
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
        else:
            # Lecturer/aggregate view: real class-wide average score and completion rate,
            # replacing the static `progress`/`avg_score` DB columns nothing else updates.
            course['avg_score'] = class_avg_score_by_course.get(code, 0)
            student_count = students_by_course.get(code, 0)
            quizzes_total = course['quizzes_total']
            possible = student_count * quizzes_total
            completed = class_completed_by_course.get(code, 0)
            course['progress'] = round(min(completed, possible) / possible * 100) if possible > 0 else 0

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


@router.get('/{course_code}/student-progress')
def get_course_student_progress(
    course_code: str,
    level: str | None = None,
    program: str | None = None,
) -> dict[str, Any]:
    """Return each enrolled student with their quiz attempts and material count for this course."""
    ensure_supabase_enabled()

    # 1. Determine level + program — try DB lookup first, fall back to query params
    c_level   = str(level   or '').strip().lower()
    c_program = str(program or '').strip().lower()

    if not c_level:
        # Try exact match first, then ilike
        for selector in [
            lambda: supabase.table('courses').select('level,program,title').eq('code', course_code).limit(1).execute(),
            lambda: supabase.table('courses').select('level,program,title').ilike('code', course_code).limit(1).execute(),
            lambda: supabase.table('courses').select('level,program,title').ilike('code', f'%{course_code.strip()}%').limit(1).execute(),
        ]:
            try:
                r = selector()
                if not supabase_failed(r) and r.data:
                    c_level   = str(r.data[0].get('level')   or '').strip().lower()
                    c_program = str(r.data[0].get('program') or '').strip().lower()
                    if c_level:
                        break
            except Exception:
                continue

    if not c_level:
        # Return empty but with a helpful message rather than 404
        return {'students': [], 'course': course_code, 'error': 'Course level could not be determined'}

    # 2. Fetch ALL students and filter by level/program
    stu_resp = supabase.table('users').select('id,name,email,level,program,status').eq('role', 'student').execute()
    if supabase_failed(stu_resp):
        raise HTTPException(status_code=502, detail=supabase_error_message(stu_resp, 'Supabase fetch students failed'))

    students = [
        s for s in (stu_resp.data or [])
        if str(s.get('level') or '').strip().lower() == c_level
        and (not c_program or str(s.get('program') or '').strip().lower() == c_program)
    ]

    if not students:
        return {'students': [], 'course': course_code, 'debug': {'c_level': c_level, 'c_program': c_program}}

    student_ids = [s['id'] for s in students]

    # 3. Fetch all quizzes for this course — try multiple matching strategies
    quizzes: list[dict] = []
    for q_selector in [
        lambda: supabase.table('quizzes').select('id,title,tier,passing_score').eq('course', course_code).execute(),
        lambda: supabase.table('quizzes').select('id,title,tier,passing_score').ilike('course', course_code).execute(),
    ]:
        try:
            r = q_selector()
            if not supabase_failed(r) and r.data:
                quizzes = r.data
                break
        except Exception:
            continue

    quiz_ids = [q['id'] for q in quizzes]
    quiz_map = {q['id']: q for q in quizzes}

    # 4. Fetch quiz attempts for enrolled students
    attempts_by_student: dict[str, list[dict]] = {str(sid): [] for sid in student_ids}
    if quiz_ids:
        try:
            att_resp = supabase.table('quiz_attempts') \
                .select('student_id,quiz_id,score,out_of,grade,passed,status,attempted_at') \
                .in_('student_id', student_ids) \
                .in_('quiz_id', quiz_ids) \
                .execute()
            for att in (att_resp.data or [] if not supabase_failed(att_resp) else []):
                sid = str(att.get('student_id', ''))
                if sid in attempts_by_student:
                    q = quiz_map.get(att.get('quiz_id'), {})
                    att['quiz_title'] = q.get('title', 'Quiz')
                    att['quiz_tier']  = q.get('tier', '—')
                    attempts_by_student[sid].append(att)
        except Exception:
            pass

    # 5. Fetch materials for this course
    material_ids: list[Any] = []
    for m_selector in [
        lambda: supabase.table('materials').select('id').eq('course', course_code).execute(),
        lambda: supabase.table('materials').select('id').ilike('course', course_code).execute(),
    ]:
        try:
            r = m_selector()
            if not supabase_failed(r) and r.data:
                material_ids = [m['id'] for m in r.data]
                break
        except Exception:
            continue
    total_materials = len(material_ids)

    # 5b. Fetch per-student reading counts for this course's materials — only genuinely
    # completed reads (real scroll-depth + time-on-page telemetry), not just "opened".
    reads_by_student: dict[str, int] = {str(sid): 0 for sid in student_ids}
    if material_ids:
        try:
            try:
                reads_resp = supabase.table('material_reads') \
                    .select('student_id,material_id') \
                    .in_('student_id', student_ids) \
                    .in_('material_id', material_ids) \
                    .eq('completed', True) \
                    .execute()
            except Exception:
                # `completed` column not present yet on this deployment's table.
                reads_resp = supabase.table('material_reads') \
                    .select('student_id,material_id') \
                    .in_('student_id', student_ids) \
                    .in_('material_id', material_ids) \
                    .execute()
            if not supabase_failed(reads_resp):
                seen: set[tuple[str, Any]] = set()
                for row in (reads_resp.data or []):
                    sid = str(row.get('student_id', ''))
                    mid = row.get('material_id')
                    key = (sid, mid)
                    if sid in reads_by_student and key not in seen:
                        seen.add(key)
                        reads_by_student[sid] += 1
        except Exception:
            pass

    # 6. Build per-student summary
    result = []
    for s in students:
        sid = str(s['id'])
        attempts = attempts_by_student.get(sid, [])
        completed = [a for a in attempts if a.get('status') == 'completed']
        # Also count non-completed attempts as done (some systems mark final without completing)
        all_attempts = attempts
        scores    = [a.get('score', 0) for a in completed]
        avg_score = round(sum(scores) / len(scores)) if scores else 0
        quizzes_done  = len(set(a.get('quiz_id') for a in completed))
        passed_count  = sum(1 for a in completed if a.get('passed'))
        quiz_progress = round((quizzes_done / len(quizzes)) * 100) if quizzes else 0
        materials_read = min(reads_by_student.get(sid, 0), total_materials) if total_materials else reads_by_student.get(sid, 0)
        reading_progress = round((materials_read / total_materials) * 100) if total_materials else 0

        result.append({
            'id':               sid,
            'name':             s.get('name', '—'),
            'email':            s.get('email', '—'),
            'level':            s.get('level', '—'),
            'program':          s.get('program', '—'),
            'status':           s.get('status', 'active'),
            'quiz_progress':    quiz_progress,
            'quizzes_done':     quizzes_done,
            'quizzes_total':    len(quizzes),
            'quizzes_passed':   passed_count,
            'avg_score':        avg_score,
            'total_materials':  total_materials,
            'materials_read':   materials_read,
            'reading_progress': reading_progress,
            'attempts':         all_attempts,
        })

    return {'students': result, 'course': course_code, 'total_materials': total_materials}

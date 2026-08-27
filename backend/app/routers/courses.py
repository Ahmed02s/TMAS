import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.security import require_roles
from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/courses', tags=['courses'])

_VALID_COURSE_STATUSES = {'active', 'archived', 'inactive'}


class CreateCourseRequest(BaseModel):
    code: str
    title: str
    level: str | None = None
    program: str | None = None
    lecturer: str | None = None
    progress: int = Field(default=0, ge=0, le=100)
    materials: int = Field(default=0, ge=0)
    quizzes_total: int = Field(default=0, ge=0)
    quizzes_done: int = Field(default=0, ge=0)
    avg_score: int = Field(default=0, ge=0, le=100)
    color: str | None = None
    status: str = 'active'

    @field_validator('code', 'title')
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('This field is required')
        return v

    @field_validator('status')
    @classmethod
    def _valid_status(cls, v: str) -> str:
        if v not in _VALID_COURSE_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_COURSE_STATUSES)}")
        return v


class UpdateCourseRequest(BaseModel):
    code: str | None = None
    title: str | None = None
    level: str | None = None
    program: str | None = None
    lecturer: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    materials: int | None = Field(default=None, ge=0)
    quizzes_total: int | None = Field(default=None, ge=0)
    quizzes_done: int | None = Field(default=None, ge=0)
    avg_score: int | None = Field(default=None, ge=0, le=100)
    color: str | None = None
    status: str | None = None

    @field_validator('code', 'title')
    @classmethod
    def _not_blank_if_present(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError('This field cannot be blank')
        return v

    @field_validator('status')
    @classmethod
    def _valid_status_if_present(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_COURSE_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_COURSE_STATUSES)}")
        return v


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


def _progress_percent(completed: int, total: int) -> int:
    return round(min(completed, total) / total * 100) if total > 0 else 0


def _course_key(value: Any) -> str:
    return re.sub(r'[^a-z0-9]', '', str(value or '').lower())


def _combined_progress(reading: int, quizzes: int, material_total: int, quiz_total: int) -> int:
    values = []
    if material_total > 0:
        values.append(reading)
    if quiz_total > 0:
        values.append(quizzes)
    return round(sum(values) / len(values)) if values else 0


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
    requested_course_keys = {_course_key(code) for code in course_codes}

    # 1. Materials count per course code
    materials_by_course: dict[str, int] = {}
    try:
        mat_resp = supabase.table('materials').select('course').execute()
        if not supabase_failed(mat_resp):
            for m in mat_resp.data or []:
                code = _course_key(m.get('course', ''))
                if code not in requested_course_keys:
                    continue
                materials_by_course[code] = materials_by_course.get(code, 0) + 1
    except Exception:
        logger.exception('list_courses: materials-count enrichment failed')

    # 2. Quiz stats per course (total quizzes published)
    quizzes_total_by_course: dict[str, int] = {}
    quiz_ids_by_course: dict[str, list[int]] = {}
    try:
        q_resp = supabase.table('quizzes').select('id,course,status,is_published').execute()
        if not supabase_failed(q_resp):
            for q in q_resp.data or []:
                if str(q.get('status') or '').lower() in {'draft', 'archived'} or q.get('is_published') is False:
                    continue
                code = _course_key(q.get('course', ''))
                if code not in requested_course_keys:
                    continue
                qid = q.get('id')
                quizzes_total_by_course[code] = quizzes_total_by_course.get(code, 0) + 1
                if qid is not None:
                    quiz_ids_by_course.setdefault(code, []).append(qid)
    except Exception:
        logger.exception('list_courses: quiz-count enrichment failed')

    # 3. Student-specific quiz attempt stats
    quizzes_done_by_course: dict[str, int] = {}
    avg_score_by_course: dict[str, float] = {}
    materials_read_by_course: dict[str, int] = {}
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
                logger.exception('list_courses: per-student quiz attempt enrichment failed')

        try:
            reads_resp = supabase.table('material_reads').select('material_id,course,completed') \
                .eq('student_id', student_id).eq('completed', True).execute()
            if not supabase_failed(reads_resp):
                seen_reads: set[tuple[str, Any]] = set()
                for row in reads_resp.data or []:
                    code = _course_key(row.get('course'))
                    key = (code, row.get('material_id'))
                    if code and key not in seen_reads:
                        seen_reads.add(key)
                        materials_read_by_course[code] = materials_read_by_course.get(code, 0) + 1
        except Exception:
            logger.exception('list_courses: per-student reading enrichment failed')

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
            logger.exception('list_courses: class-wide quiz attempt enrichment failed')

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
                        code = _course_key(course.get('code', ''))
                        students_by_course[code] = students_by_course.get(code, 0) + 1
    except Exception:
        logger.exception('list_courses: student-count enrichment failed')

    # Apply enriched stats to each course
    for course in courses:
        code = _course_key(course.get('code', ''))
        mat_count = materials_by_course.get(code, course.get('materials', 0))
        course['materials'] = mat_count
        course['quizzes_total'] = quizzes_total_by_course.get(code, course.get('quizzes_total', 0))
        course['student_count'] = students_by_course.get(code, 0)
        if student_id:
            course['quizzes_done'] = quizzes_done_by_course.get(code, 0)
            course['avg_score'] = avg_score_by_course.get(code, 0)
            course['materials_read'] = min(materials_read_by_course.get(code, 0), mat_count)
            course['reading_progress'] = _progress_percent(course['materials_read'], mat_count)
            course['quiz_progress'] = _progress_percent(course['quizzes_done'], course['quizzes_total'])
            course['progress'] = _combined_progress(
                course['reading_progress'], course['quiz_progress'], mat_count, course['quizzes_total']
            )
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
def create_course(payload: CreateCourseRequest, _claims: dict = Depends(require_roles('admin', 'administrator'))) -> dict[str, Any]:
    ensure_supabase_enabled()
    record = payload.model_dump()
    response = supabase.table('courses').insert(record).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase create course failed'))
    if response.data:
        return {'course': response.data[0]}
    raise HTTPException(status_code=502, detail='Supabase create course returned no course')


@router.patch('/{course_id}')
def update_course(course_id: str, payload: UpdateCourseRequest, _claims: dict = Depends(require_roles('admin', 'administrator'))) -> dict[str, Any]:
    ensure_supabase_enabled()
    record = payload.model_dump(exclude_unset=True)
    if not record:
        raise HTTPException(status_code=400, detail='No updatable fields provided')

    response = supabase.table('courses').update(record).eq('id', course_id).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase update course failed'))
    if response.data:
        return {'course': response.data[0]}
    raise HTTPException(status_code=404, detail='Course not found')


@router.delete('/{course_id}', status_code=204)
def delete_course(course_id: str, _claims: dict = Depends(require_roles('admin', 'administrator'))):
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
    _claims: dict = Depends(require_roles('admin', 'administrator', 'lecturer')),
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
    try:
        r = supabase.table('quizzes').select('id,title,course,difficulty_level,passing_score,status,is_published').execute()
        if not supabase_failed(r):
            quizzes = [
                q for q in (r.data or [])
                if _course_key(q.get('course')) == _course_key(course_code)
                and str(q.get('status') or '').lower() not in {'draft', 'archived'}
                and q.get('is_published') is not False
            ]
    except Exception:
        logger.exception('get_course_student_progress: quizzes fetch failed for course=%s', course_code)

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
                    att['quiz_tier']  = q.get('difficulty_level', '—')
                    attempts_by_student[sid].append(att)
        except Exception:
            logger.exception('get_course_student_progress: attempts fetch failed for course=%s', course_code)

    # 5. Fetch materials for this course
    material_ids: list[Any] = []
    try:
        r = supabase.table('materials').select('id,course').execute()
        if not supabase_failed(r):
            material_ids = [m['id'] for m in (r.data or []) if _course_key(m.get('course')) == _course_key(course_code)]
    except Exception:
        logger.exception('get_course_student_progress: materials fetch failed for course=%s', course_code)
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
            logger.exception('get_course_student_progress: material reads fetch failed for course=%s', course_code)

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
        overall_progress = _combined_progress(reading_progress, quiz_progress, total_materials, len(quizzes))

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
            'progress':         overall_progress,
            'attempts':         all_attempts,
        })

    return {'students': result, 'course': course_code, 'total_materials': total_materials}

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, field_validator

from app.core.security import require_roles
from app.core.authorization import lecturer_course_codes, normalize_course_code
from app.core.course_assignments import sync_student_enrollments
from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message

router = APIRouter(prefix='/api/dashboard', tags=['dashboard'])


def _strip_password(row: dict[str, Any]) -> dict[str, Any]:
    """`users` rows carry a `password` column (bcrypt hash, or plaintext for accounts not
    yet migrated) that must never reach the browser, even for an admin's own dashboard."""
    return {k: v for k, v in row.items() if k != 'password'}


_VALID_LECTURER_STATUSES = {'active', 'rejected', 'suspended'}
_VALID_STUDENT_STATUSES = {'active', 'suspended', 'revoked'}


class UpdateLecturerStatusRequest(BaseModel):
    status: str

    @field_validator('status')
    @classmethod
    def _valid_status(cls, v: str) -> str:
        if v not in _VALID_LECTURER_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_LECTURER_STATUSES)}")
        return v


class UpdateStudentRequest(BaseModel):
    status: str | None = None
    level: str | None = None
    name: str | None = None
    email: EmailStr | None = None
    program: str | None = None
    institution: str | None = None

    @field_validator('status')
    @classmethod
    def _valid_status_if_present(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_STUDENT_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_STUDENT_STATUSES)}")
        return v

    @field_validator('name')
    @classmethod
    def _not_blank_if_present(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError('Name cannot be blank')
        return v


@router.get('/students')
def list_students(
    level: str | None = None,
    program: str | None = None,
    lecturer: str | None = None,
    _claims: dict = Depends(require_roles('admin', 'administrator', 'lecturer')),
) -> dict[str, Any]:
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
            # `courses.lecturer` can hold multiple comma-separated names for co-assigned
            # courses (e.g. "SAAKA AHMED, Med Saaka") — an exact ilike (no wildcards) only
            # matches when a course has exactly one lecturer and it matches verbatim, so any
            # co-taught course was silently excluded. The wildcard makes this a substring match.
            course_resp = supabase.table('courses').select('id,code,level,program').execute()
            if supabase_failed(course_resp):
                raise HTTPException(status_code=502, detail=supabase_error_message(course_resp, 'Supabase list lecturer courses failed'))

            allowed_codes = lecturer_course_codes(_claims) if str(_claims.get('role') or '').lower() == 'lecturer' else None
            allowed_courses = [
                course for course in (course_resp.data or [])
                if allowed_codes is None or normalize_course_code(course.get('code')) in allowed_codes
            ]
            used_explicit_enrollment = False
            if allowed_codes is not None:
                try:
                    course_ids = [course.get('id') for course in allowed_courses if course.get('id') is not None]
                    enrollment_resp = supabase.table('course_enrollments').select('student_id,status') \
                        .in_('course_id', course_ids).in_('status', ['active', 'completed']).execute()
                    if not supabase_failed(enrollment_resp):
                        enrolled_ids = {str(row.get('student_id')) for row in (enrollment_resp.data or [])}
                        students = [student for student in students if str(student.get('id')) in enrolled_ids]
                        used_explicit_enrollment = True
                except Exception:
                    pass
            if not used_explicit_enrollment:
                course_pairs = {(course.get('level'), course.get('program')) for course in allowed_courses}
                students = [student for student in students if (student.get('level'), student.get('program')) in course_pairs]

    # Attach real per-student learning progress. Course eligibility follows the same
    # level/program rules used throughout the system; completion combines reading and
    # quiz completion and never borrows a class-wide percentage from another student.
    try:
        courses_query = supabase.table('courses').select('code,level,program,status')
        caller_is_lecturer = str(_claims.get('role') or '').lower() == 'lecturer'
        if lecturer and lecturer.strip() and not caller_is_lecturer:
            courses_query = courses_query.ilike('lecturer', f'%{lecturer.strip()}%')
        courses_resp = courses_query.execute()
        if not supabase_failed(courses_resp):
            from app.routers.courses import get_course_student_progress

            summaries: dict[str, list[int]] = {str(s.get('id')): [] for s in students}
            enrolled: dict[str, int] = {str(s.get('id')): 0 for s in students}
            caller_course_codes = lecturer_course_codes(_claims) if caller_is_lecturer else None
            for course in courses_resp.data or []:
                if caller_course_codes is not None and normalize_course_code(course.get('code')) not in caller_course_codes:
                    continue
                if str(course.get('status') or 'active').lower() != 'active' or not course.get('code'):
                    continue
                result = get_course_student_progress(course['code'], course.get('level'), course.get('program'), _claims)
                for progress_row in result.get('students', []):
                    sid = str(progress_row.get('id'))
                    if sid in summaries:
                        enrolled[sid] += 1
                        summaries[sid].append(int(progress_row.get('progress') or 0))
            for student in students:
                sid = str(student.get('id'))
                values = summaries.get(sid, [])
                student['courses'] = enrolled.get(sid, 0)
                student['completion'] = round(sum(values) / len(values)) if values else 0
    except Exception:
        # User management must remain available if analytics enrichment temporarily fails.
        for student in students:
            student.setdefault('courses', 0)
            student.setdefault('completion', 0)

    return {'students': [_strip_password(s) for s in students]}


@router.get('/lecturers')
def list_lecturers(_claims: dict = Depends(require_roles('admin', 'administrator'))) -> dict[str, Any]:
    ensure_supabase_enabled()
    response = supabase.table('users').select('*').eq('role', 'lecturer').execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase list lecturers failed'))
    return {'lecturers': [_strip_password(l) for l in (response.data or [])]}


@router.patch('/lecturers/{lecturer_id}/status')
def update_lecturer_status(lecturer_id: str, payload: UpdateLecturerStatusRequest, _claims: dict = Depends(require_roles('admin', 'administrator'))) -> dict[str, Any]:
    ensure_supabase_enabled()
    response = supabase.table('users').update({'status': payload.status}).eq('id', lecturer_id).eq('role', 'lecturer').execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase update lecturer status failed'))
    if response.data:
        return {'lecturer': _strip_password(response.data[0])}
    raise HTTPException(status_code=404, detail='Lecturer not found')


@router.get('/lecturer-analytics')
def lecturer_analytics(lecturer: str, _claims: dict = Depends(require_roles('admin', 'administrator', 'lecturer'))) -> dict[str, Any]:
    """Real analytics for a lecturer's own courses: average score, pass rate, at-risk
    student count, highest-completion course, and per-course score distribution. Reuses
    the same per-course/per-student aggregation as the course monitor drill-down so the
    numbers here are always consistent with what a lecturer sees when they expand a course.
    """
    ensure_supabase_enabled()
    lecturer = lecturer.strip()
    empty: dict[str, Any] = {
        'avg_score': 0,
        'pass_rate': 0,
        'at_risk_students': 0,
        'highest_completion_course': None,
        'score_distribution': [],
    }
    if not lecturer:
        return empty

    courses_resp = supabase.table('courses').select('*').execute()
    if supabase_failed(courses_resp):
        raise HTTPException(status_code=502, detail=supabase_error_message(courses_resp, 'Supabase list lecturer courses failed'))
    courses = courses_resp.data or []
    if str(_claims.get('role') or '').lower() == 'lecturer':
        allowed_codes = lecturer_course_codes(_claims)
        courses = [course for course in courses if normalize_course_code(course.get('code')) in allowed_codes]
    else:
        courses = [course for course in courses if lecturer.lower() in str(course.get('lecturer') or '').lower()]
    if not courses:
        return empty

    from app.routers.courses import get_course_student_progress

    score_distribution: list[dict[str, Any]] = []
    all_scores: list[float] = []
    total_attempts = 0
    total_passed = 0
    at_risk_student_ids: set[str] = set()
    highest: dict[str, Any] | None = None

    for course in courses:
        code = course.get('code')
        if not code:
            continue
        try:
            result = get_course_student_progress(code, course.get('level'), course.get('program'), _claims)
        except HTTPException:
            continue

        students = result.get('students', [])
        course_scores = [s['avg_score'] for s in students if s.get('avg_score', 0) > 0]
        course_avg = round(sum(course_scores) / len(course_scores)) if course_scores else 0
        quizzes_total = students[0].get('quizzes_total', 0) if students else 0
        completed_count = sum(1 for s in students if quizzes_total and s.get('quizzes_done', 0) >= quizzes_total)
        completion_pct = round((completed_count / len(students)) * 100) if students else 0

        for s in students:
            for att in s.get('attempts', []):
                total_attempts += 1
                if att.get('passed'):
                    total_passed += 1
            if s.get('quizzes_total', 0) > 0:
                student_pct = round((s.get('quizzes_done', 0) / s['quizzes_total']) * 100)
                if student_pct < 50:
                    at_risk_student_ids.add(s['id'])
            if s.get('avg_score', 0) > 0:
                all_scores.append(s['avg_score'])

        score_distribution.append({
            'code': code,
            'title': course.get('title'),
            'avg_score': course_avg,
            'students': len(students),
            'completion': completion_pct,
        })
        if students and (highest is None or completion_pct > highest['completion']):
            highest = {'code': code, 'title': course.get('title'), 'completion': completion_pct}

    return {
        'avg_score': round(sum(all_scores) / len(all_scores)) if all_scores else 0,
        'pass_rate': round((total_passed / total_attempts) * 100) if total_attempts else 0,
        'at_risk_students': len(at_risk_student_ids),
        'highest_completion_course': highest,
        'score_distribution': score_distribution,
    }


@router.patch('/students/{student_id}')
def update_student(student_id: str, payload: UpdateStudentRequest, _claims: dict = Depends(require_roles('admin', 'administrator'))) -> dict[str, Any]:
    """Update student fields such as status, level, name or email."""
    ensure_supabase_enabled()
    record = payload.model_dump(exclude_unset=True)
    if not record:
        raise HTTPException(status_code=400, detail='No updatable fields provided')

    response = supabase.table('users').update(record).eq('id', student_id).eq('role', 'student').execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase update student failed'))
    if response.data:
        student = response.data[0]
        if 'level' in record or 'program' in record:
            sync_student_enrollments(student['id'], student.get('level'), student.get('program'))
        return {'student': _strip_password(student)}
    raise HTTPException(status_code=404, detail='Student not found')

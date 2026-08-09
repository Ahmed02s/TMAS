from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, field_validator

from app.core.security import require_roles
from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message

router = APIRouter(prefix='/api/dashboard', tags=['dashboard'])

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
def update_lecturer_status(lecturer_id: str, payload: UpdateLecturerStatusRequest, _claims: dict = Depends(require_roles('admin', 'administrator'))) -> dict[str, Any]:
    ensure_supabase_enabled()
    response = supabase.table('users').update({'status': payload.status}).eq('id', lecturer_id).eq('role', 'lecturer').execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase update lecturer status failed'))
    if response.data:
        return {'lecturer': response.data[0]}
    raise HTTPException(status_code=404, detail='Lecturer not found')


@router.get('/lecturer-analytics')
def lecturer_analytics(lecturer: str) -> dict[str, Any]:
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

    courses_resp = supabase.table('courses').select('*').ilike('lecturer', lecturer).execute()
    if supabase_failed(courses_resp):
        raise HTTPException(status_code=502, detail=supabase_error_message(courses_resp, 'Supabase list lecturer courses failed'))
    courses = courses_resp.data or []
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
            result = get_course_student_progress(code, course.get('level'), course.get('program'))
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
        return {'student': response.data[0]}
    raise HTTPException(status_code=404, detail='Student not found')

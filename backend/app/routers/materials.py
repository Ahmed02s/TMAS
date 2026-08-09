import re
from pathlib import Path
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message
import postgrest

router = APIRouter(prefix='/api/materials', tags=['materials'])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / 'data' / 'uploads'
ALLOWED_EXTENSIONS = {'.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.md'}
MAX_FILE_SIZE = 50 * 1024 * 1024


def _format_size(size: int) -> str:
    unit = 'B'
    value = float(size)
    for next_unit in ['KB', 'MB', 'GB']:
        if value < 1024:
            break
        value /= 1024
        unit = next_unit
    return f'{value:.1f}{unit}' if unit != 'B' else f'{int(value)}{unit}'


def _sanitize_filename(filename: str) -> str:
    filename = Path(filename).name
    return re.sub(r'[^a-zA-Z0-9._-]', '_', filename)


def _clean_course_code(value: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', value or '').lower()


def _resolve_material_path(material: dict) -> Path | None:
    """Look for the material's file on local disk, trying the stored path first, then a
    few likely locations by course/filename."""
    path = material.get('path')
    candidates: list[Path] = []
    if path:
        candidates.append(Path(path))

    course_name = str(material.get('course') or '').strip()
    material_name = str(material.get('name') or '').strip()
    if course_name:
        safe_course = re.sub(r'[^a-zA-Z0-9._-]', '_', course_name)
        candidates.append(UPLOAD_DIR / safe_course / material_name)
    candidates.append(UPLOAD_DIR / material_name)

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate

    if material_name:
        target_name = material_name.lower()
        for file_item in UPLOAD_DIR.rglob('*'):
            if file_item.is_file() and (file_item.name.lower() == target_name or file_item.name.lower().endswith(f"_{target_name}") or target_name in file_item.name.lower()):
                return file_item

    return None


def _fetch_remote_material_copy(material: dict) -> Path | None:
    """Render's filesystem is ephemeral — every deploy/restart wipes locally-written
    uploads, which is why a material that resolved fine minutes ago can suddenly 404
    with 'not found on disk'. When the local copy is missing, pull the durable copy back
    from Supabase Storage (recorded as file_url at upload time) into a temp file so
    downstream code (preview extraction, download) can treat it like a normal local file.
    """
    file_url = material.get('file_url')
    if not file_url:
        return None
    try:
        import httpx
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            resp = client.get(file_url)
            if resp.status_code != 200 or not resp.content:
                return None
        material_name = str(material.get('name') or 'material')
        suffix = Path(material_name).suffix
        cache_dir = UPLOAD_DIR / '_remote_cache'
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = cache_dir / f"{material.get('id')}{suffix}"
        cache_path.write_bytes(resp.content)
        return cache_path
    except Exception:
        return None


def _resolve_material_file(material: dict) -> Path | None:
    return _resolve_material_path(material) or _fetch_remote_material_copy(material)


@router.get('')
def list_materials(course: str | None = None, lecturer: str | None = None) -> dict[str, Any]:
    ensure_supabase_enabled()
    query = supabase.table('materials').select('*')
    if lecturer:
        lecturer = lecturer.strip()
        if lecturer:
            query = query.ilike('lecturer', lecturer)

    response = query.execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase list materials failed'))

    materials = response.data or []
    if course:
        # Match tolerantly (case/format-insensitive) instead of an exact DB equality check —
        # lecturers and the courses they upload against are often typed with slightly
        # different casing/spacing (e.g. "COMP 401" vs "comp401"), which silently hid
        # materials from students when matched with a strict equality filter.
        target = _clean_course_code(course)
        materials = [
            m for m in materials
            if target and (
                _clean_course_code(str(m.get('course') or '')) == target
                or target in _clean_course_code(str(m.get('course') or ''))
                or _clean_course_code(str(m.get('course') or '')) in target
            )
        ]

    return {'materials': materials}


# ─────────────────────────────────────────────
# READING PROGRESS — Supabase-backed tracking
# Must come BEFORE parameterized /{material_id} routes
# ─────────────────────────────────────────────

@router.get('/reading-progress')
def get_reading_progress(student_id: str | None = None, course: str | None = None) -> dict[str, Any]:
    """Return which material IDs a student has read, and per-course reading progress."""
    if not student_id:
        return {'read_ids': [], 'course_progress': {}}

    ensure_supabase_enabled()
    try:
        query = supabase.table('material_reads').select('material_id,course,read_at').eq('student_id', student_id)
        if course:
            query = query.eq('course', course)
        resp = query.execute()
        if supabase_failed(resp):
            return {'read_ids': [], 'course_progress': {}}

        rows = resp.data or []
        read_ids = [r['material_id'] for r in rows]

        # Count reads grouped by course
        course_read: dict[str, int] = {}
        for r in rows:
            c = r.get('course', '')
            course_read[c] = course_read.get(c, 0) + 1

        return {'read_ids': read_ids, 'course_progress': course_read}
    except Exception:
        return {'read_ids': [], 'course_progress': {}}


class MarkReadRequest(BaseModel):
    student_id: str


@router.post('/{material_id}/mark-read')
def mark_material_read(material_id: int, payload: MarkReadRequest) -> dict[str, Any]:
    """Records that a student has opened/read a material, so reading-progress endpoints
    (student-facing and the lecturer's per-student course monitor) have real data to show.
    Idempotent: re-reading the same material doesn't create duplicate rows."""
    ensure_supabase_enabled()
    if not payload.student_id:
        raise HTTPException(status_code=400, detail='student_id is required')

    response = supabase.table('materials').select('id,course').eq('id', material_id).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase get material failed'))
    if not response.data:
        raise HTTPException(status_code=404, detail='Material not found')
    material = response.data[0]

    record = {
        'student_id': payload.student_id,
        'material_id': material_id,
        'course': material.get('course') or '',
        'read_at': datetime.utcnow().isoformat(),
    }

    try:
        upsert_resp = supabase.table('material_reads').upsert(record, on_conflict='student_id,material_id').execute()
        if supabase_failed(upsert_resp):
            raise HTTPException(status_code=502, detail=supabase_error_message(upsert_resp, 'Supabase record material read failed'))
    except postgrest.exceptions.APIError as e:
        raise HTTPException(status_code=502, detail=f'Could not record read status: {e}')

    return {'status': 'recorded', 'material_id': material_id, 'student_id': payload.student_id}


@router.post('', status_code=201)
async def upload_materials(
    course: str = Form(...),
    lecturer: str = Form(...),
    files: list[UploadFile] = File(...),
) -> dict[str, Any]:
    ensure_supabase_enabled()
    lecturer = lecturer.strip()
    course = course.strip()
    if not course or not lecturer:
        raise HTTPException(status_code=400, detail='Course and lecturer are required')

    if not files:
        raise HTTPException(status_code=400, detail='No files uploaded')

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    course_dir = UPLOAD_DIR / re.sub(r'[^a-zA-Z0-9._-]', '_', course)
    course_dir.mkdir(parents=True, exist_ok=True)

    created_materials: list[Any] = []
    # Local disk is NOT durable on most hosts (e.g. Render wipes it on every deploy/restart),
    # so Supabase Storage is the only reliable long-term copy. Track failures here instead of
    # only printing them server-side, so the lecturer actually finds out a file is at risk.
    storage_warnings: list[str] = []
    for upload in files:
        filename = _sanitize_filename(upload.filename)
        file_ext = Path(filename).suffix.lower()
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f'Unsupported file type: {file_ext}')

        contents = await upload.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail='File exceeds maximum size of 50MB')

        file_path = course_dir / f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{filename}"
        file_path.write_bytes(contents)

        file_url = None
        storage_path = f"{re.sub(r'[^a-zA-Z0-9._-]', '_', course)}/{file_path.name}"
        try:
            supabase.storage.from_('materials').upload(
                path=storage_path,
                file=contents,
                file_options={'content-type': upload.content_type or 'application/octet-stream', 'upsert': 'true'},
            )
            file_url = supabase.storage.from_('materials').get_public_url(storage_path)
        except Exception as err:
            print(f"Supabase storage bucket upload fallback to local disk: {err}")
            storage_warnings.append(filename)

        record = {
            'name': filename,
            'course': course,
            'lecturer': lecturer,
            'size': _format_size(len(contents)),
            'uploaded': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC'),
            'status': 'Processed',
            'quiz_generated': False,
            'path': str(file_path),
            'file_url': file_url,
            'file_name': filename,
            'file_type': file_ext,
            'file_size': len(contents),
        }

        try:
            response = supabase.table('materials').insert(record).execute()
        except postgrest.exceptions.APIError as e:
            err_msg = str(e)
            if "Could not find the 'path' column" in err_msg or "Could not find the \"path\" column" in err_msg:
                minimal = dict(record)
                minimal.pop('path', None)
                try:
                    retry_resp = supabase.table('materials').insert(minimal).execute()
                except postgrest.exceptions.APIError as e2:
                    raise HTTPException(status_code=502, detail=f'Supabase insert material failed for {filename} (retry without path): {e2}')
                if supabase_failed(retry_resp):
                    raise HTTPException(status_code=502, detail=supabase_error_message(retry_resp, f'Supabase insert material failed for {filename} (retry without path)'))
                created_materials.extend(retry_resp.data or [])
            else:
                raise HTTPException(status_code=502, detail=f'Supabase insert material failed for {filename}: {err_msg}')
        else:
            if supabase_failed(response):
                raise HTTPException(status_code=502, detail=supabase_error_message(response, f'Supabase insert material failed for {filename}'))
            created_materials.extend(response.data or [])

    result: dict[str, Any] = {'materials': created_materials}
    if storage_warnings:
        result['warning'] = (
            f"Cloud backup failed for: {', '.join(storage_warnings)}. "
            "These files were saved locally only and may be lost if the server restarts — try re-uploading."
        )
    return result


@router.post('/{material_id}/mark_processed')
def mark_material_processed(material_id: int):
    ensure_supabase_enabled()
    response = supabase.table('materials').select('*').eq('id', material_id).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase get material failed'))
    if not response.data:
        raise HTTPException(status_code=404, detail='Material not found')

    update_resp = supabase.table('materials').update({'status': 'Processed'}).eq('id', material_id).execute()
    if supabase_failed(update_resp):
        raise HTTPException(status_code=502, detail=supabase_error_message(update_resp, 'Supabase update material failed'))

    return {'material': (update_resp.data or [])[0]}


@router.api_route('/{material_id}/download', methods=['GET', 'HEAD'])
def download_material(material_id: int):
    ensure_supabase_enabled()
    response = supabase.table('materials').select('*').eq('id', material_id).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase get material failed'))
    if not response.data:
        raise HTTPException(status_code=404, detail='Material not found')

    material = response.data[0]
    resolved_path = _resolve_material_path(material)

    if not resolved_path:
        # Local disk copy is gone (e.g. server redeployed/restarted). Try to redirect
        # straight to the durable Supabase Storage copy before giving up.
        file_url = material.get('file_url')
        if file_url:
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=file_url, status_code=302)
        raise HTTPException(status_code=404, detail='Material file not found on disk')

    return FileResponse(resolved_path, filename=material.get('name') or resolved_path.name)


@router.get('/{material_id}/content')
def get_material_content(material_id: int):
    ensure_supabase_enabled()
    response = supabase.table('materials').select('*').eq('id', material_id).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase get material failed'))
    if not response.data:
        raise HTTPException(status_code=404, detail='Material not found')

    material = response.data[0]
    material_name = str(material.get('name') or '').strip()
    course_name = str(material.get('course') or '').strip()

    # Falls back to Supabase Storage automatically if the local disk copy is gone.
    resolved_path = _resolve_material_file(material)

    text_content = ''
    if resolved_path:
        from app.routers.quizzes import _extract_text_from_file
        text_content = _extract_text_from_file(str(resolved_path))

    if not text_content:
        text_content = f"Material: {material_name}\nCourse: {course_name}\nLecturer: {material.get('lecturer', 'Lecturer')}\n\n[Content preview extracted from uploaded file. Use Download button to view full original document format.]"

    return {
        'material_id': material_id,
        'name': material_name,
        'content': text_content,
    }



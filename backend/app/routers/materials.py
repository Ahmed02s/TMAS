import logging
import re
import shutil
from pathlib import Path
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.security import get_current_claims_optional, require_roles
from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_failed, supabase_error_message
from app.services import office_convert
import postgrest

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/materials', tags=['materials'])


def _verify_acting_as_self_if_authenticated(claims: dict[str, Any] | None, student_id: str) -> None:
    """Same rationale as quizzes._verify_acting_as_self, but optional: reading-progress
    telemetry is sent via `navigator.sendBeacon` on unmount (see MaterialViewer.tsx), which
    cannot attach an Authorization header, so this only enforces identity when a token IS
    present rather than hard-requiring one and breaking that beacon path."""
    if claims is not None and str(claims.get('sub') or '') != str(student_id or ''):
        raise HTTPException(status_code=403, detail='You can only do this for your own account')

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


# Magic-byte signatures for the extensions we accept. The extension allowlist alone only
# checks the filename a client claims — nothing stops a renamed executable from being
# uploaded as "notes.pdf" and later served back to students via /download. This is a light
# sanity check (not a full antivirus/content scan), so .txt/.md are skipped: arbitrary bytes
# are "valid" plain text, there's no signature to check against.
_PDF_MAGIC = b'%PDF-'
_ZIP_MAGIC = (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08')  # .docx / .pptx (OOXML = zip)
_OLE_MAGIC = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'  # legacy .doc / .ppt (OLE compound file)


def _looks_like_declared_type(contents: bytes, file_ext: str) -> bool:
    if file_ext == '.pdf':
        return contents.startswith(_PDF_MAGIC)
    if file_ext in {'.docx', '.pptx'}:
        return contents.startswith(_ZIP_MAGIC)
    if file_ext in {'.doc', '.ppt'}:
        return contents.startswith(_OLE_MAGIC) or contents.startswith(_ZIP_MAGIC)
    return True  # .txt / .md — no reliable signature to check


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
        logger.exception('_fetch_remote_material_copy: failed to fetch/cache file_url=%s', file_url)
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
    """Return which material IDs a student has genuinely completed (per scroll-depth +
    time-on-page telemetry, not merely opened), and per-course reading progress."""
    if not student_id:
        return {'read_ids': [], 'course_progress': {}}

    ensure_supabase_enabled()

    def _run(select_completed: bool):
        query = supabase.table('material_reads').select(
            'material_id,course,read_at,completed' if select_completed else 'material_id,course,read_at'
        ).eq('student_id', student_id)
        q = query.eq('course', course) if course else query
        return q.execute()

    try:
        try:
            resp = _run(select_completed=True)
            rows = resp.data or [] if not supabase_failed(resp) else []
            rows = [r for r in rows if r.get('completed')]
        except postgrest.exceptions.APIError:
            # `completed` column not present yet on this deployment's table — degrade to
            # "opened at all" rather than erroring the whole endpoint.
            resp = _run(select_completed=False)
            rows = resp.data or [] if not supabase_failed(resp) else []

        read_ids = [r['material_id'] for r in rows]

        # Count reads grouped by course
        course_read: dict[str, int] = {}
        for r in rows:
            c = r.get('course', '')
            course_read[c] = course_read.get(c, 0) + 1

        return {'read_ids': read_ids, 'course_progress': course_read}
    except Exception:
        logger.exception('get_reading_progress failed for student_id=%s course=%s', student_id, course)
        return {'read_ids': [], 'course_progress': {}}


def _safe_insert(table: str, record: dict[str, Any]) -> Any:
    """Insert, dropping any column PostgREST reports as missing and retrying — generalizes
    what upload_materials used to do as a hand-written check for just the 'path' column, so
    new optional fields (e.g. pdf_url) also degrade gracefully on a deployment whose table
    hasn't been migrated yet, without a fresh hardcoded check for each one."""
    body = dict(record)
    while True:
        try:
            return supabase.table(table).insert(body).execute()
        except postgrest.exceptions.APIError as exc:
            msg = str(exc)
            m = re.search(r"Could not find the '([^']+)' column", msg)
            if not m or m.group(1) not in body:
                raise
            body.pop(m.group(1), None)


def _safe_upsert(table: str, record: dict[str, Any], on_conflict: str) -> Any:
    """Upsert, dropping any column PostgREST reports as missing and retrying — lets new
    telemetry fields degrade gracefully on a deployment whose table hasn't been migrated yet."""
    body = dict(record)
    while True:
        try:
            return supabase.table(table).upsert(body, on_conflict=on_conflict).execute()
        except postgrest.exceptions.APIError as exc:
            msg = str(exc)
            m = re.search(r"Could not find the '([^']+)' column", msg)
            if not m or m.group(1) not in body:
                raise
            body.pop(m.group(1), None)


class MarkReadRequest(BaseModel):
    student_id: str


@router.post('/{material_id}/mark-read')
def mark_material_read(
    material_id: int,
    payload: MarkReadRequest,
    claims: dict[str, Any] | None = Depends(get_current_claims_optional),
) -> dict[str, Any]:
    """Records that a student has opened/read a material, so reading-progress endpoints
    (student-facing and the lecturer's per-student course monitor) have real data to show.
    Idempotent: re-reading the same material doesn't create duplicate rows."""
    ensure_supabase_enabled()
    if not payload.student_id:
        raise HTTPException(status_code=400, detail='student_id is required')
    _verify_acting_as_self_if_authenticated(claims, payload.student_id)

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


# Below this, the material is considered genuinely completed even if scroll depth alone
# hasn't crossed the threshold (covers short content that fits in the viewport with no
# scrolling at all, where scroll_percent reads 100 immediately on open).
_PROGRESS_SCROLL_THRESHOLD = 85
_PROGRESS_MIN_DWELL_SECONDS = 10
_PROGRESS_TIME_ONLY_THRESHOLD = 180


class MaterialProgressRequest(BaseModel):
    student_id: str
    scroll_percent: int = Field(default=0, ge=0, le=100)
    time_spent_delta: int = Field(default=0, ge=0, le=3600)


@router.post('/{material_id}/progress')
def update_material_progress(
    material_id: int,
    payload: MaterialProgressRequest,
    claims: dict[str, Any] | None = Depends(get_current_claims_optional),
) -> dict[str, Any]:
    """Scroll-depth + time-on-page telemetry, reported periodically while a student has a
    material open. `time_spent_delta` is the active seconds since the previous report (not
    a cumulative total) so repeated reports never double-count; scroll_percent is the
    farthest point reached this report and only ever ratchets up server-side.

    Auth is optional (not required) because MaterialViewer.tsx sends the final report via
    `navigator.sendBeacon` on unmount, which cannot attach an Authorization header; identity
    is still checked whenever a token IS present.
    """
    ensure_supabase_enabled()
    if not payload.student_id:
        raise HTTPException(status_code=400, detail='student_id is required')
    _verify_acting_as_self_if_authenticated(claims, payload.student_id)

    response = supabase.table('materials').select('id,course').eq('id', material_id).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase get material failed'))
    if not response.data:
        raise HTTPException(status_code=404, detail='Material not found')
    material = response.data[0]

    existing_scroll = 0
    existing_time = 0
    try:
        existing_resp = supabase.table('material_reads').select('scroll_percent,time_spent_seconds') \
            .eq('student_id', payload.student_id).eq('material_id', material_id).limit(1).execute()
        if not supabase_failed(existing_resp) and existing_resp.data:
            existing_scroll = existing_resp.data[0].get('scroll_percent') or 0
            existing_time = existing_resp.data[0].get('time_spent_seconds') or 0
    except Exception:
        logger.exception('update_material_progress: failed to fetch existing progress for material_id=%s', material_id)

    new_scroll = max(existing_scroll, payload.scroll_percent)
    new_time = existing_time + payload.time_spent_delta
    completed = (new_scroll >= _PROGRESS_SCROLL_THRESHOLD and new_time >= _PROGRESS_MIN_DWELL_SECONDS) or new_time >= _PROGRESS_TIME_ONLY_THRESHOLD

    record = {
        'student_id': payload.student_id,
        'material_id': material_id,
        'course': material.get('course') or '',
        'read_at': datetime.utcnow().isoformat(),
        'scroll_percent': new_scroll,
        'time_spent_seconds': new_time,
        'completed': completed,
    }
    upsert_resp = _safe_upsert('material_reads', record, 'student_id,material_id')
    if supabase_failed(upsert_resp):
        raise HTTPException(status_code=502, detail=supabase_error_message(upsert_resp, 'Supabase update material progress failed'))

    return {'scroll_percent': new_scroll, 'time_spent_seconds': new_time, 'completed': completed}


@router.get('/{material_id}/my-progress')
def get_material_progress(
    material_id: int,
    student_id: str,
    claims: dict[str, Any] | None = Depends(get_current_claims_optional),
) -> dict[str, Any]:
    """Lets the reader resume showing a student's real progress on a material they've
    already partially read, instead of restarting the telemetry display from zero."""
    ensure_supabase_enabled()
    _verify_acting_as_self_if_authenticated(claims, student_id)
    if not student_id:
        return {'scroll_percent': 0, 'time_spent_seconds': 0, 'completed': False}
    try:
        resp = supabase.table('material_reads').select('scroll_percent,time_spent_seconds,completed') \
            .eq('student_id', student_id).eq('material_id', material_id).limit(1).execute()
        if not supabase_failed(resp) and resp.data:
            row = resp.data[0]
            return {
                'scroll_percent': row.get('scroll_percent') or 0,
                'time_spent_seconds': row.get('time_spent_seconds') or 0,
                'completed': bool(row.get('completed')),
            }
    except Exception:
        logger.exception('get_material_progress: failed to fetch progress for material_id=%s', material_id)
    return {'scroll_percent': 0, 'time_spent_seconds': 0, 'completed': False}


class PageReadRequest(BaseModel):
    student_id: str
    page_number: int = Field(ge=1)
    total_pages: int | None = Field(default=None, ge=1)


@router.post('/{material_id}/page-read')
def record_page_read(
    material_id: int,
    payload: PageReadRequest,
    claims: dict[str, Any] | None = Depends(get_current_claims_optional),
) -> dict[str, Any]:
    """Granular per-page telemetry for the paginated PDF reader (PdfReader.tsx), on top of
    the existing scroll/time model in update_material_progress — lets a lecturer eventually
    see exactly which pages a student actually reached, and lets the reader resume at the
    student's last-viewed page (see get_material_last_page below).

    Degrades gracefully if `material_page_reads` doesn't exist yet on this deployment (the
    migration hasn't been run) — this granular record is a bonus on top of `material_reads`,
    not something the reader depends on to function.
    """
    ensure_supabase_enabled()
    if not payload.student_id:
        raise HTTPException(status_code=400, detail='student_id is required')
    _verify_acting_as_self_if_authenticated(claims, payload.student_id)

    response = supabase.table('materials').select('id,course').eq('id', material_id).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase get material failed'))
    if not response.data:
        raise HTTPException(status_code=404, detail='Material not found')

    from app.routers.quizzes import _is_missing_table_error

    try:
        existing = supabase.table('material_page_reads').select('view_count') \
            .eq('student_id', payload.student_id).eq('material_id', material_id).eq('page_number', payload.page_number) \
            .limit(1).execute()
        view_count = ((existing.data or [{}])[0].get('view_count') or 0) + 1 if not supabase_failed(existing) and existing.data else 1
        supabase.table('material_page_reads').upsert({
            'student_id': payload.student_id,
            'material_id': material_id,
            'page_number': payload.page_number,
            'view_count': view_count,
            'last_viewed_at': datetime.utcnow().isoformat(),
        }, on_conflict='student_id,material_id,page_number').execute()
    except postgrest.exceptions.APIError as exc:
        if not _is_missing_table_error(exc):
            logger.exception('record_page_read: material_page_reads upsert failed for material_id=%s page=%s', material_id, payload.page_number)

    # Keep material_reads.last_page in sync too, so resume works even before/without the
    # per-page table (e.g. mid-rollout, or a deployment that skipped that part of the migration).
    last_page_record: dict[str, Any] = {
        'student_id': payload.student_id,
        'material_id': material_id,
        'last_page': payload.page_number,
    }
    if payload.total_pages:
        last_page_record['total_pages'] = payload.total_pages
    _safe_upsert('material_reads', last_page_record, 'student_id,material_id')

    return {'status': 'recorded', 'material_id': material_id, 'page_number': payload.page_number}


@router.get('/{material_id}/last-page')
def get_material_last_page(
    material_id: int,
    student_id: str,
    claims: dict[str, Any] | None = Depends(get_current_claims_optional),
) -> dict[str, Any]:
    """Lets the PDF reader resume at the student's last-viewed page instead of always
    reopening at page 1. Returns nulls (never errors) if there's nothing to resume from yet,
    or if this deployment hasn't run the migration adding `last_page`/`total_pages`."""
    ensure_supabase_enabled()
    _verify_acting_as_self_if_authenticated(claims, student_id)
    if not student_id:
        return {'last_page': None, 'total_pages': None}
    try:
        resp = supabase.table('material_reads').select('last_page,total_pages') \
            .eq('student_id', student_id).eq('material_id', material_id).limit(1).execute()
        if not supabase_failed(resp) and resp.data:
            row = resp.data[0]
            return {'last_page': row.get('last_page'), 'total_pages': row.get('total_pages')}
    except Exception:
        logger.exception('get_material_last_page: failed to fetch last page for material_id=%s', material_id)
    return {'last_page': None, 'total_pages': None}


@router.post('', status_code=201)
async def upload_materials(
    course: str = Form(...),
    lecturer: str = Form(...),
    files: list[UploadFile] = File(...),
    _claims: dict[str, Any] = Depends(require_roles('lecturer', 'admin', 'administrator')),
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
        if not _looks_like_declared_type(contents, file_ext):
            raise HTTPException(status_code=400, detail=f"{filename} does not look like a valid {file_ext} file")

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

        # PPTX/PPT -> PDF: lets the reader show the same paginated PdfReader used for real
        # PDFs instead of the client-side JSZip text+image approximation. Only runs where
        # LibreOffice is actually installed (see backend/Dockerfile) — silently skipped
        # everywhere else (local dev, or Render before it's switched to the Docker deploy
        # that installs it), leaving the original upload unaffected either way.
        pdf_url = None
        if file_ext in {'.pptx', '.ppt'} and office_convert.is_conversion_available():
            converted_path = office_convert.convert_to_pdf(file_path)
            if converted_path:
                try:
                    pdf_storage_path = f"{re.sub(r'[^a-zA-Z0-9._-]', '_', course)}/{file_path.stem}.pdf"
                    supabase.storage.from_('materials').upload(
                        path=pdf_storage_path,
                        file=converted_path.read_bytes(),
                        file_options={'content-type': 'application/pdf', 'upsert': 'true'},
                    )
                    pdf_url = supabase.storage.from_('materials').get_public_url(pdf_storage_path)
                except Exception:
                    logger.exception('upload_materials: failed to upload converted PDF for %s', filename)
                finally:
                    shutil.rmtree(converted_path.parent, ignore_errors=True)

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
            'pdf_url': pdf_url,
            'file_name': filename,
            'file_type': file_ext,
            'file_size': len(contents),
        }

        insert_resp = _safe_insert('materials', record)
        if supabase_failed(insert_resp):
            raise HTTPException(status_code=502, detail=supabase_error_message(insert_resp, f'Supabase insert material failed for {filename}'))
        created_materials.extend(insert_resp.data or [])

    result: dict[str, Any] = {'materials': created_materials}
    if storage_warnings:
        result['warning'] = (
            f"Cloud backup failed for: {', '.join(storage_warnings)}. "
            "These files were saved locally only and may be lost if the server restarts — try re-uploading."
        )
    return result


@router.delete('/{material_id}')
def delete_material(
    material_id: int,
    _claims: dict[str, Any] = Depends(require_roles('lecturer', 'admin', 'administrator')),
) -> dict[str, Any]:
    """Deletes a material the lecturer no longer wants students to see. Best-effort cleans
    up the underlying file (local disk + Supabase Storage) and any reading-progress rows,
    but never lets a missing/already-gone file block removing the database record."""
    ensure_supabase_enabled()
    response = supabase.table('materials').select('*').eq('id', material_id).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase get material failed'))
    if not response.data:
        raise HTTPException(status_code=404, detail='Material not found')
    material = response.data[0]

    try:
        local_path = _resolve_material_path(material)
        if local_path and local_path.exists():
            local_path.unlink()
    except Exception:
        logger.exception('delete_material: failed to remove local file for material_id=%s', material_id)

    if material.get('file_url') and material.get('path'):
        try:
            course_name = str(material.get('course') or '').strip()
            safe_course = re.sub(r'[^a-zA-Z0-9._-]', '_', course_name)
            basename = Path(material['path']).name
            supabase.storage.from_('materials').remove([f"{safe_course}/{basename}"])
        except Exception:
            logger.exception('delete_material: failed to remove Supabase Storage object for material_id=%s', material_id)

    try:
        supabase.table('material_reads').delete().eq('material_id', material_id).execute()
    except Exception:
        logger.exception('delete_material: failed to delete material_reads rows for material_id=%s', material_id)

    delete_resp = supabase.table('materials').delete().eq('id', material_id).execute()
    if supabase_failed(delete_resp):
        raise HTTPException(status_code=502, detail=supabase_error_message(delete_resp, 'Supabase delete material failed'))

    return {'status': 'deleted', 'material_id': material_id}


@router.post('/{material_id}/mark_processed')
def mark_material_processed(
    material_id: int,
    _claims: dict[str, Any] = Depends(require_roles('lecturer', 'admin', 'administrator')),
):
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


@router.api_route('/{material_id}/pdf', methods=['GET', 'HEAD'])
def download_material_pdf(material_id: int):
    """Serves a PPTX/PPT's converted PDF (see office_convert.py) so the frontend can read it
    through PdfReader instead of the client-side PPTX approximation. 404s if this material
    was never converted (uploaded before the feature existed, not a PPTX, or converted on a
    deployment without LibreOffice) — the frontend falls back to the original PPTX flow
    unchanged when this 404s, so it's a safe, additive endpoint."""
    ensure_supabase_enabled()
    try:
        # Named column select (not '*') fails outright if `pdf_url` doesn't exist yet on
        # this deployment — treated the same as "not converted" rather than a 502, since
        # either way there's no converted PDF to serve.
        response = supabase.table('materials').select('pdf_url').eq('id', material_id).limit(1).execute()
    except postgrest.exceptions.APIError:
        raise HTTPException(status_code=404, detail='No converted PDF available for this material')
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase get material failed'))
    if not response.data:
        raise HTTPException(status_code=404, detail='Material not found')

    pdf_url = response.data[0].get('pdf_url')
    if not pdf_url:
        raise HTTPException(status_code=404, detail='No converted PDF available for this material')

    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=pdf_url, status_code=302)


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



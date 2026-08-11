import pytest

from app.routers.materials import (
    _clean_course_code,
    _format_size,
    _looks_like_declared_type,
    _sanitize_filename,
)


# ── Human-readable file size ──────────────────────────────────────────────────

@pytest.mark.parametrize('size,expected', [
    (0, '0B'),
    (512, '512B'),
    (1024, '1.0KB'),
    (1536, '1.5KB'),
    (1024 * 1024, '1.0MB'),
    (5 * 1024 * 1024, '5.0MB'),
    (1024 * 1024 * 1024, '1.0GB'),
])
def test_format_size(size, expected):
    assert _format_size(size) == expected


# ── Filename sanitization (path traversal / injection defense) ──────────────

def test_sanitize_filename_strips_directory_components():
    # Path(...).name discards any traversal segments, so this must never leak a path.
    assert _sanitize_filename('../../etc/passwd') == 'passwd'
    assert _sanitize_filename('..\\..\\windows\\system32\\config') == 'config'


def test_sanitize_filename_replaces_unsafe_characters():
    assert _sanitize_filename('my notes (final)!.pdf') == 'my_notes__final__.pdf'


def test_sanitize_filename_preserves_safe_characters():
    assert _sanitize_filename('Lecture-01_Intro.pdf') == 'Lecture-01_Intro.pdf'


# ── Magic-byte content sniffing (defense against renamed-extension uploads) ──

def test_looks_like_declared_type_accepts_real_pdf():
    assert _looks_like_declared_type(b'%PDF-1.7\n...', '.pdf')


def test_looks_like_declared_type_rejects_fake_pdf():
    # e.g. an executable or plain text renamed to .pdf
    assert not _looks_like_declared_type(b'MZ\x90\x00this is not a pdf', '.pdf')


def test_looks_like_declared_type_accepts_ooxml_docx_and_pptx():
    zip_header = b'PK\x03\x04' + b'\x00' * 20
    assert _looks_like_declared_type(zip_header, '.docx')
    assert _looks_like_declared_type(zip_header, '.pptx')


def test_looks_like_declared_type_accepts_legacy_ole_doc_and_ppt():
    ole_header = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1' + b'\x00' * 20
    assert _looks_like_declared_type(ole_header, '.doc')
    assert _looks_like_declared_type(ole_header, '.ppt')


def test_looks_like_declared_type_rejects_mismatched_binary():
    assert not _looks_like_declared_type(b'random bytes not matching any signature', '.doc')


def test_looks_like_declared_type_has_no_signature_check_for_plain_text():
    # .txt/.md have no reliable magic-byte signature, so anything is accepted here —
    # this documents that behavior rather than asserting a false sense of validation.
    assert _looks_like_declared_type(b'anything at all', '.txt')
    assert _looks_like_declared_type(b'anything at all', '.md')


# ── Course code normalization (used to match materials to a course) ─────────

def test_clean_course_code_strips_punctuation_and_lowercases():
    assert _clean_course_code('CSCD 301') == 'cscd301'
    assert _clean_course_code('csc-d-301!') == 'cscd301'


def test_clean_course_code_handles_empty_input():
    assert _clean_course_code('') == ''
    assert _clean_course_code(None) == ''

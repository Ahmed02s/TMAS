import pytest

from app.routers.materials import (
    _TUTOR_ACTIONS,
    _MAX_FULL_TEXT_CONTEXT_CHARS,
    _build_tutor_context_block,
)
from app.routers.quizzes import _extract_pdf_pages


# ── Supported AI Tutor actions ────────────────────────────────────────────────

def test_tutor_actions_has_no_unexpected_entries():
    # Guards against a typo'd action name silently making a valid request 400.
    assert _TUTOR_ACTIONS == {'ask', 'explain_page', 'summarize', 'practice'}


# ── Per-page PDF text extraction (graceful failure) ──────────────────────────

def test_extract_pdf_pages_returns_empty_list_for_missing_path():
    assert _extract_pdf_pages('/no/such/file.pdf') == []


def test_extract_pdf_pages_returns_empty_list_for_non_pdf_bytes():
    from io import BytesIO
    assert _extract_pdf_pages(BytesIO(b'not a pdf at all')) == []


# ── Context-priority selection (current page -> neighbors -> whole material) ─

def test_context_block_uses_current_page_when_available():
    context = {'pages': ['page one text', 'page two text', 'page three text'], 'full_text': 'whole doc'}
    text, page = _build_tutor_context_block(context, current_page=2)
    assert text == 'page two text'
    assert page == 2


def test_context_block_falls_back_to_full_text_when_no_page_given():
    context = {'pages': ['a', 'b'], 'full_text': 'whole document text'}
    text, page = _build_tutor_context_block(context, current_page=None)
    assert text == 'whole document text'
    assert page is None


def test_context_block_falls_back_to_full_text_when_page_out_of_range():
    context = {'pages': ['a', 'b'], 'full_text': 'whole document text'}
    text, page = _build_tutor_context_block(context, current_page=99)
    assert text == 'whole document text'
    assert page is None


def test_context_block_widens_to_neighbors_when_current_page_is_blank():
    # e.g. an image-only slide with no extractable text — don't send the LLM nothing.
    context = {'pages': ['intro content', '', 'later content'], 'full_text': 'whole doc'}
    text, page = _build_tutor_context_block(context, current_page=2)
    assert 'intro content' in text
    assert page == 2


def test_context_block_handles_no_pages_and_no_text():
    context = {'pages': None, 'full_text': ''}
    text, page = _build_tutor_context_block(context, current_page=3)
    assert text == ''
    assert page is None


def test_context_block_truncates_oversized_full_text():
    context = {'pages': None, 'full_text': 'x' * (_MAX_FULL_TEXT_CONTEXT_CHARS + 500)}
    text, page = _build_tutor_context_block(context, current_page=None)
    assert len(text) == _MAX_FULL_TEXT_CONTEXT_CHARS

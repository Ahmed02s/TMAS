import pytest

from app.routers.quizzes import (
    QUESTION_TYPE_SECONDS,
    _answers_match,
    _compute_time_limit_minutes,
    _course_generation_label,
    _grade_from_score,
    _generated_quiz_title,
    _materials_match_course,
    _merge_submission_answers,
    _normalize_single_question_type,
    _ordered_questions_for_student,
    _question_type_seconds,
)


def test_question_generation_prefers_course_title_over_code():
    assert _course_generation_label('COMP 402', 'Human Nutrition') == 'Human Nutrition'
    assert _course_generation_label('COMP 402', '') == 'COMP 402'


def test_submission_answers_recover_server_draft_without_overriding_final_client_values():
    assert _merge_submission_answers(
        {'0': 'saved zero', '1': 'old answer'},
        {'1': 'final answer', '2': 'new answer'},
    ) == {'0': 'saved zero', '1': 'final answer', '2': 'new answer'}


def test_attempt_review_reconstructs_same_stable_question_order():
    questions = [
        {'id': 1, 'question': 'One', 'options': ['A', 'B', 'C'], 'question_type': 'MCQ'},
        {'id': 2, 'question': 'Two', 'options': ['True', 'False'], 'question_type': 'True/False'},
        {'id': 3, 'question': 'Three', 'options': [], 'question_type': 'Short Answer'},
    ]
    first = _ordered_questions_for_student(questions, 10, 'student-1')
    second = _ordered_questions_for_student(questions, 10, 'student-1')
    assert first == second
    assert all(question['type'] in {'MCQ', 'True/False', 'Short Answer'} for question in first)


def test_generated_quiz_title_uses_single_material_name():
    title = _generated_quiz_title('Foundational', [{'name': 'Database Concepts.pdf'}], 'CS 401')
    assert title == 'Foundation Quiz: Database Concepts'
    assert 'AI Generated' not in title


def test_generated_quiz_title_uses_course_materials_for_multiple_sources():
    title = _generated_quiz_title(
        'Mastery',
        [{'name': 'Week One.pdf'}, {'name': 'Week Two.pdf'}],
        'CS 401',
    )
    assert title == 'Mastery Quiz: Combined Course Materials'


def test_materials_match_course_accepts_equivalent_course_formatting():
    assert _materials_match_course([{'course': 'COMP 401'}], 'comp-401')


def test_materials_match_course_rejects_material_from_another_course():
    assert not _materials_match_course([{'course': 'COMP 401'}, {'course': 'COMP 402'}], 'COMP 401')


def test_materials_match_course_rejects_missing_course_assignment():
    assert not _materials_match_course([{'course': ''}], 'COMP 401')


# ── Question type normalization ──────────────────────────────────────────────

@pytest.mark.parametrize('value', ['MCQ', 'True/False', 'Fill in the Blank', 'Short Answer'])
def test_normalize_single_question_type_passes_known_types_through(value):
    assert _normalize_single_question_type(value) == value


@pytest.mark.parametrize('value', [None, '', 'mcq', 'essay', 'Multiple Choice'])
def test_normalize_single_question_type_defaults_unknown_to_mcq(value):
    assert _normalize_single_question_type(value) == 'MCQ'


# ── Per-question-type anti-cheat timers ──────────────────────────────────────

def test_question_type_seconds_matches_declared_table():
    assert _question_type_seconds('MCQ') == 60
    assert _question_type_seconds('True/False') == 45
    assert _question_type_seconds('Fill in the Blank') == 45
    assert _question_type_seconds('Short Answer') == 90


def test_question_type_seconds_is_case_insensitive():
    assert _question_type_seconds('mcq') == 60
    assert _question_type_seconds('SHORT ANSWER') == 90


def test_question_type_seconds_defaults_unknown_to_mcq_window():
    assert _question_type_seconds('essay') == 60
    assert _question_type_seconds(None) == 60


def test_question_type_seconds_table_has_no_unexpected_entries():
    # Guards against a typo'd key silently falling back to the 60s default.
    assert set(QUESTION_TYPE_SECONDS) == {'mcq', 'true/false', 'fill in the blank', 'short answer'}


# ── Quiz-level time limit derivation ─────────────────────────────────────────

def test_compute_time_limit_minutes_empty_quiz_gets_floor():
    assert _compute_time_limit_minutes([]) == 5


def test_compute_time_limit_minutes_small_quiz_still_gets_floor():
    # A single MCQ is only 60s, but the floor keeps very short quizzes usable.
    assert _compute_time_limit_minutes([{'type': 'MCQ'}]) == 5


def test_compute_time_limit_minutes_sums_and_rounds_up():
    questions = [{'type': 'MCQ'}] * 5 + [{'type': 'Short Answer'}] * 2  # 5*60 + 2*90 = 480s = 8min exactly
    assert _compute_time_limit_minutes(questions) == 8


def test_compute_time_limit_minutes_rounds_up_partial_minute():
    # 4 MCQ (240s) + 1 Fill in the Blank (45s) = 285s -> ceil to 5min
    questions = [{'type': 'MCQ'}] * 4 + [{'type': 'Fill in the Blank'}]
    assert _compute_time_limit_minutes(questions) == 5

    # Push it just over a minute boundary: 6 MCQ (360s) + 1 Short Answer (90s) = 450s = 7.5min -> 8
    questions = [{'type': 'MCQ'}] * 6 + [{'type': 'Short Answer'}]
    assert _compute_time_limit_minutes(questions) == 8


def test_compute_time_limit_minutes_reads_question_type_fallback_key():
    # generate_quiz/publish_quiz sometimes hand this DB rows using `question_type` instead
    # of the in-memory `type` key — both must be honored identically.
    questions = [{'question_type': 'Short Answer'}] * 4  # 4*90 = 360s = 6min
    assert _compute_time_limit_minutes(questions) == 6


# ── Score -> letter grade ─────────────────────────────────────────────────────

@pytest.mark.parametrize('score,expected', [
    (100, 'A'), (90, 'A'),
    (89, 'B'), (80, 'B'),
    (79, 'C'), (70, 'C'),
    (69, 'D'), (60, 'D'),
    (59, 'F'), (0, 'F'),
])
def test_grade_from_score_boundaries(score, expected):
    assert _grade_from_score(score) == expected


# ── Answer grading ────────────────────────────────────────────────────────────

def test_answers_match_exact_case_insensitive():
    assert _answers_match('Paris', 'paris', 'MCQ')
    assert _answers_match('True', 'true', 'True/False')


def test_answers_match_rejects_wrong_mcq_answer():
    assert not _answers_match('Paris', 'London', 'MCQ')


def test_answers_match_rejects_empty_answer():
    assert not _answers_match('Paris', '', 'MCQ')
    assert not _answers_match('Paris', '   ', 'Short Answer')


def test_answers_match_allows_substring_for_text_types():
    assert _answers_match('Halt', 'halt', 'Fill in the Blank')
    assert _answers_match('mitosis', 'the process of mitosis', 'Short Answer')


def test_answers_match_allows_word_superset_for_text_types():
    assert _answers_match('cell division', 'cell division occurs during mitosis', 'Short Answer')


def test_answers_match_does_not_allow_partial_match_for_mcq():
    # Partial-match leniency is only for free-text question types, not MCQ/True-False —
    # otherwise "Pari" would incorrectly score as correct against "Paris".
    assert not _answers_match('Paris', 'Pari', 'MCQ')

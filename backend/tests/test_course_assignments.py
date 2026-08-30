from app.core.course_assignments import academic_match


def test_academic_match_requires_same_level_and_program():
    assert academic_match('LEVEL 400', 'Computer Science', 'level 400', 'computer science')
    assert not academic_match('LEVEL 300', 'Computer Science', 'LEVEL 400', 'Computer Science')
    assert not academic_match('LEVEL 400', 'Information Technology', 'LEVEL 400', 'Computer Science')


def test_academic_match_allows_general_course_without_program():
    assert academic_match('LEVEL 400', 'Computer Science', 'LEVEL 400', '')
    assert academic_match(' LEVEL 400 ', None, 'level 400', None)


def test_academic_match_rejects_course_without_level():
    assert not academic_match('LEVEL 400', 'Computer Science', '', 'Computer Science')

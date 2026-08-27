import time

import jwt

from app.core.config import JWT_ALGORITHM, JWT_SECRET
from app.core.security import create_attempt_token, verify_attempt_token


def test_attempt_token_is_bound_to_quiz_and_student():
    token = create_attempt_token(quiz_id=42, student_id='student-1', lifetime_seconds=300)

    assert verify_attempt_token(token, quiz_id=42, student_id='student-1')
    assert not verify_attempt_token(token, quiz_id=43, student_id='student-1')
    assert not verify_attempt_token(token, quiz_id=42, student_id='student-2')


def test_expired_or_wrong_purpose_token_is_rejected():
    expired = jwt.encode({
        'sub': 'student-1',
        'quiz_id': 42,
        'purpose': 'quiz_attempt',
        'iat': int(time.time()) - 120,
        'exp': int(time.time()) - 60,
    }, JWT_SECRET, algorithm=JWT_ALGORITHM)
    ordinary_session = jwt.encode({
        'sub': 'student-1',
        'quiz_id': 42,
        'purpose': 'session',
        'exp': int(time.time()) + 300,
    }, JWT_SECRET, algorithm=JWT_ALGORITHM)

    assert not verify_attempt_token(expired, quiz_id=42, student_id='student-1')
    assert not verify_attempt_token(ordinary_session, quiz_id=42, student_id='student-1')

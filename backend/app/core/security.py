"""Password hashing and session-token (JWT) helpers, plus FastAPI auth dependencies.

Design notes (read before changing):
- Passwords: new/changed passwords are always stored as bcrypt hashes. Existing accounts
  created before this module existed have their password stored as plaintext — `verify_password`
  detects that (a bcrypt hash always starts with `$2`) and falls back to a direct string
  compare so those accounts keep working, then the caller (see auth.py) re-hashes and saves
  the password on that successful login so the account is transparently upgraded.
- Tokens: real signed, expiring JWTs (HS256) instead of the previous `user_id|email` string.
  Old tokens issued before this change will simply fail verification, so existing sessions
  are logged out once — that's an unavoidable and correct consequence of fixing "tokens have
  no signature/expiry", not a bug. Accounts/passwords are unaffected.
"""
import time
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException

from app.core.config import JWT_ALGORITHM, JWT_EXPIRES_MINUTES, JWT_SECRET

_BCRYPT_PREFIXES = ('$2a$', '$2b$', '$2y$')


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def is_bcrypt_hash(value: str) -> bool:
    return isinstance(value, str) and value.startswith(_BCRYPT_PREFIXES)


def verify_password(plain_password: str, stored_password: str) -> bool:
    """True if `plain_password` matches `stored_password`, whether the latter is a bcrypt
    hash (current format) or legacy plaintext (pre-existing accounts)."""
    if not stored_password:
        return False
    if is_bcrypt_hash(stored_password):
        try:
            return bcrypt.checkpw(plain_password.encode('utf-8'), stored_password.encode('utf-8'))
        except ValueError:
            return False
    # Legacy plaintext account — constant-time-ish compare is unnecessary here since this
    # path only exists for migration and disappears the moment the account is upgraded.
    return plain_password == stored_password


def create_access_token(*, user_id: str, email: str, role: str) -> str:
    now = int(time.time())
    payload = {
        'sub': str(user_id),
        'email': email,
        'role': role,
        'iat': now,
        'exp': now + JWT_EXPIRES_MINUTES * 60,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(' ', 1)
    if len(parts) == 2 and parts[0].lower() == 'bearer' and parts[1].strip():
        return parts[1].strip()
    return None


def get_current_claims(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """FastAPI dependency: require a valid, unexpired session token. Returns the decoded
    JWT claims (sub/email/role) — NOT a fresh DB row, so it's cheap to use on every request;
    routes that need up-to-date profile fields (status, level, etc.) should still look the
    user up by `sub` when it matters."""
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    claims = decode_access_token(token)
    if not claims:
        raise HTTPException(status_code=401, detail='Session expired or invalid — please log in again')
    return claims


def get_current_claims_optional(authorization: str | None = Header(default=None)) -> dict[str, Any] | None:
    """Same as get_current_claims but never raises — for routes that must keep working for
    callers that haven't sent a token yet (e.g. mid-rollout), while still letting handlers
    use the identity when it IS present."""
    token = _extract_bearer_token(authorization)
    if not token:
        return None
    return decode_access_token(token)


def require_roles(*roles: str):
    """Dependency factory: `Depends(require_roles('admin', 'administrator'))`."""
    normalized = {r.lower() for r in roles}

    def dependency(claims: dict[str, Any] = Depends(get_current_claims)) -> dict[str, Any]:
        if str(claims.get('role', '')).lower() not in normalized:
            raise HTTPException(status_code=403, detail='You do not have permission to perform this action')
        return claims

    return dependency

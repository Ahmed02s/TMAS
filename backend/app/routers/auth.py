import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, field_validator

from app.core.security import (
    create_access_token,
    get_current_claims,
    hash_password,
    is_bcrypt_hash,
    verify_password,
)
from app.core.supabase_client import ensure_supabase_enabled, supabase, supabase_error_message, supabase_failed

router = APIRouter(prefix='/api/auth', tags=['auth'])

PASSWORD_RESET_EXPIRY_MINUTES = 30


class AuthRegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = 'student'
    level: str | None = None
    program: str | None = None
    department: str | None = None
    index_number: str | None = None

    @field_validator('name')
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Name is required')
        return v

    @field_validator('password')
    @classmethod
    def _password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v


class AuthLoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def _password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v


def _build_user_payload(user: dict[str, Any]) -> dict[str, Any]:
    return {
        'id': user.get('id', user.get('email', 'demo-user')),
        'name': user.get('name', user.get('email', 'Demo User')),
        'email': user.get('email', ''),
        'role': user.get('role', 'student'),
        'status': user.get('status', 'active'),
        'level': user.get('level'),
        'program': user.get('program'),
        'department': user.get('department', user.get('dept')),
    }


@router.post('/register', status_code=201)
def register(payload: AuthRegisterRequest) -> dict[str, Any]:
    ensure_supabase_enabled()

    if payload.role == 'student' and (not payload.level or not payload.program or not payload.index_number):
        raise HTTPException(status_code=400, detail='Student registration requires index number, level, and program.')

    if payload.role not in {'student', 'lecturer', 'admin', 'administrator'}:
        raise HTTPException(status_code=400, detail='Invalid role supplied.')

    user_id = str(uuid.uuid4())
    email = payload.email.strip().lower()

    insert_dict = {
        'id': user_id,
        'index_number': payload.index_number if payload.role == 'student' else None,
        'name': payload.name,
        'email': email,
        'password': hash_password(payload.password),
        'role': payload.role,
        'status': 'pending' if payload.role == 'lecturer' else 'active',
        'level': payload.level,
        'program': payload.program or payload.department,
        'department': payload.department or payload.program,
    }

    # Automatically adapt to schema differences if 'department' or 'program' columns don't exist in Supabase
    response = None
    while True:
        try:
            response = supabase.table('users').insert(insert_dict).execute()
            break
        except Exception as e:
            error_msg = str(e)
            if 'duplicate key' in error_msg.lower() or 'users_email_key' in error_msg or 'users_index_number_key' in error_msg:
                if 'users_index_number_key' in error_msg:
                    raise HTTPException(status_code=400, detail='This Index Number is already registered.')
                raise HTTPException(status_code=400, detail='Email already exists. Please use a different email.')
            m = re.search(r"Could not find the '([^']+)' column of '([^']+)'", error_msg)
            if m:
                missing_col = m.group(1)
                if missing_col in insert_dict:
                    insert_dict.pop(missing_col, None)
                    continue
            raise HTTPException(status_code=502, detail=f'Registration failed: {error_msg}')

    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase register failed'))
    if response.data:
        user = response.data[0]
        token = create_access_token(user_id=user['id'], email=user['email'], role=user.get('role', 'student'))
        return {'user': _build_user_payload(user), 'token': token}
    raise HTTPException(status_code=502, detail='Supabase register returned no user')


@router.post('/login')
def login(payload: AuthLoginRequest) -> dict[str, Any]:
    ensure_supabase_enabled()
    email = payload.email.strip().lower()

    # Looked up by email only (not email+password) — password comparison happens below via
    # verify_password so it can support both bcrypt hashes and legacy plaintext accounts.
    response = supabase.table('users').select('*').eq('email', email).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase login failed'))
    if not response.data:
        raise HTTPException(status_code=401, detail='Invalid credentials')

    user = response.data[0]
    stored_password = user.get('password') or ''
    if not verify_password(payload.password, stored_password):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    # Transparently upgrade legacy plaintext accounts to a bcrypt hash on successful login —
    # old credentials keep working, but the stored value is secured from this point on.
    if not is_bcrypt_hash(stored_password):
        try:
            supabase.table('users').update({'password': hash_password(payload.password)}).eq('id', user['id']).execute()
        except Exception:
            pass  # Non-fatal — login still succeeds even if the upgrade write fails.

    role = str(user.get('role', 'student')).lower()
    status = str(user.get('status', 'active')).lower()
    if status == 'suspended':
        raise HTTPException(status_code=403, detail='Your account has been suspended by Administrator. Please contact support.')
    if role == 'lecturer' and status != 'active':
        if status == 'pending':
            raise HTTPException(status_code=403, detail='Lecturer account is pending administrator approval.')
        raise HTTPException(status_code=403, detail='Lecturer account is not approved.')

    token = create_access_token(user_id=user['id'], email=user['email'], role=user.get('role', 'student'))
    return {'user': _build_user_payload(user), 'token': token}


@router.get('/me')
def me(claims: dict[str, Any] = Depends(get_current_claims)) -> dict[str, Any]:
    ensure_supabase_enabled()
    user_id = claims.get('sub')
    if not user_id:
        raise HTTPException(status_code=401, detail='Unauthorized')

    response = supabase.table('users').select('*').eq('id', user_id).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase auth failed'))
    if response.data:
        return {'user': _build_user_payload(response.data[0])}
    raise HTTPException(status_code=401, detail='Unauthorized')


@router.post('/forgot-password')
def forgot_password(payload: ForgotPasswordRequest) -> dict[str, Any]:
    """Always returns success (even for an unknown email) so this endpoint can't be used to
    enumerate registered addresses. No email-delivery provider is configured for this app
    yet, so the reset link is returned directly in the response — wire a real mail send in
    `_deliver_reset_link` below once SMTP/SendGrid/etc. credentials are available; nothing
    else about this flow needs to change.
    """
    ensure_supabase_enabled()
    email = payload.email.strip().lower()

    response = supabase.table('users').select('id,email,name').eq('email', email).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase lookup failed'))

    generic_result = {'status': 'sent', 'message': 'If that email is registered, password reset instructions have been sent.'}
    if not response.data:
        return generic_result

    user = response.data[0]
    reset_token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_EXPIRY_MINUTES)).isoformat()

    try:
        supabase.table('password_resets').insert({
            'user_id': user['id'],
            'token': reset_token,
            'expires_at': expires_at,
            'used': False,
        }).execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Could not start password reset: {exc}')

    dev_reset_info = _deliver_reset_link(user, reset_token)
    result = dict(generic_result)
    if dev_reset_info:
        # Only present until real email delivery is wired up — see docstring above.
        result.update(dev_reset_info)
    return result


def _deliver_reset_link(user: dict[str, Any], reset_token: str) -> dict[str, Any] | None:
    """Stub delivery: no SMTP/email provider is configured, so hand the token back directly
    instead of silently discarding it (which would make the whole flow non-functional).
    Replace this body with a real email send and return None once that's wired up."""
    print(f"[password reset] token for {user.get('email')}: {reset_token} (expires in {PASSWORD_RESET_EXPIRY_MINUTES}m)")
    return {'dev_reset_token': reset_token, 'dev_note': 'Email delivery is not configured yet — use this token to reset your password.'}


@router.post('/reset-password')
def reset_password(payload: ResetPasswordRequest) -> dict[str, Any]:
    ensure_supabase_enabled()

    response = supabase.table('password_resets').select('*').eq('token', payload.token).eq('used', False).limit(1).execute()
    if supabase_failed(response):
        raise HTTPException(status_code=502, detail=supabase_error_message(response, 'Supabase lookup failed'))
    if not response.data:
        raise HTTPException(status_code=400, detail='This reset link is invalid or has already been used.')

    reset_row = response.data[0]
    expires_at = reset_row.get('expires_at')
    if expires_at:
        try:
            expiry_dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            if expiry_dt.tzinfo is None:
                expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expiry_dt:
                raise HTTPException(status_code=400, detail='This reset link has expired. Please request a new one.')
        except ValueError:
            pass

    user_id = reset_row.get('user_id')
    update_resp = supabase.table('users').update({'password': hash_password(payload.new_password)}).eq('id', user_id).execute()
    if supabase_failed(update_resp):
        raise HTTPException(status_code=502, detail=supabase_error_message(update_resp, 'Supabase password update failed'))

    try:
        supabase.table('password_resets').update({'used': True}).eq('id', reset_row['id']).execute()
    except Exception:
        pass

    return {'status': 'reset', 'message': 'Your password has been updated. You can now log in with your new password.'}

import os
from email.message import EmailMessage
from html import escape

import httpx

from app.core.config import CONTACT_EMAIL, EMAIL_FROM, EMAIL_FROM_NAME, EMAIL_REPLY_TO, FRONTEND_URL, SENDGRID_API_KEY

SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'


def _wrap_html_document(body_html: str) -> str:
    """Wraps an HTML fragment in a complete, valid document. A bare fragment (no doctype/
    html/head) is technically valid as an email's HTML part, but several mail clients and
    security/spam gateways treat an incomplete document as a signal to fall back to the
    plain-text alternative instead of rendering it — a full document renders reliably."""
    return (
        '<!doctype html>'
        '<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>'
        f'<body style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1f2937;">{body_html}</body>'
        '</html>'
    )


def _frontend_url(path: str, query: str) -> str:
    return f"{FRONTEND_URL.rstrip('/')}/{path.lstrip('/')}?{query}"


def _build_email_payload(to_email: str, to_name: str, reset_token: str) -> dict[str, object]:
    reset_url = _frontend_url('forgot-password', f'token={reset_token}')
    from_name = EMAIL_FROM_NAME.strip() or 'TMAS'
    from_email = EMAIL_FROM.strip()
    reply_to = EMAIL_REPLY_TO.strip() or from_email

    html_body = _wrap_html_document(
        f'<p>Hi {to_name},</p>'
        f'<p>We received a request to reset your TMAS password.</p>'
        f'<p><a href="{reset_url}" target="_blank" rel="noopener noreferrer">Click here to reset your password</a></p>'
        f'<p>If that does not work, copy and paste this link into your browser:</p>'
        f'<p><a href="{reset_url}" target="_blank" rel="noopener noreferrer">{reset_url}</a></p>'
        '<p>If you did not request this, you can safely ignore this message.</p>'
        '<p>Thanks,<br/>TMAS Team</p>'
    )

    return {
        'personalizations': [
            {
                'to': [{'email': to_email, 'name': to_name}],
                'subject': 'Reset your TMAS password',
            }
        ],
        'from': {'email': from_email, 'name': from_name},
        'reply_to': {'email': reply_to, 'name': from_name},
        'content': [
            {
                'type': 'text/plain',
                'value': (
                    f'Hi {to_name},\n\n'
                    'We received a request to reset your TMAS password.\n\n'
                    f'Click here to reset your password: {reset_url}\n\n'
                    'If you did not request this, you can safely ignore this message.\n\n'
                    'Thanks,\n'
                    'TMAS Team'
                ),
            },
            {
                'type': 'text/html',
                'value': html_body,
            },
        ],
    }


def send_password_reset_email(to_email: str, to_name: str, reset_token: str) -> None:
    if not SENDGRID_API_KEY:
        raise RuntimeError('SendGrid API key is not configured.')
    if not EMAIL_FROM:
        raise RuntimeError('EMAIL_FROM is not configured.')

    body = _build_email_payload(to_email, to_name or 'Student', reset_token)
    headers = {
        'Authorization': f'Bearer {SENDGRID_API_KEY}',
        'Content-Type': 'application/json',
    }

    response = httpx.post(SENDGRID_API_URL, json=body, headers=headers, timeout=15.0)
    if response.status_code >= 400:
        raise RuntimeError(f'SendGrid send failed: {response.status_code} {response.text}')


def _build_verification_email_payload(to_email: str, to_name: str, verify_token: str) -> dict[str, object]:
    # A distinct `verify_token` param (not `token`) so this link can never be confused with
    # a password-reset link if a user has both sitting in their inbox at once.
    verify_url = _frontend_url('verify-email', f'verify_token={verify_token}')
    from_name = EMAIL_FROM_NAME.strip() or 'TMAS'
    from_email = EMAIL_FROM.strip()
    reply_to = EMAIL_REPLY_TO.strip() or from_email
    safe_name = escape(to_name or 'Student')
    safe_verify_url = escape(verify_url, quote=True)

    html_body = _wrap_html_document(
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">'
        '<tr><td align="center">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        'style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">'
        f'<tr><td><h1 style="margin:0 0 20px;color:#3b0764;font-size:26px">Verify your TMAS account</h1>'
        f'<p style="margin:0 0 16px">Hi {safe_name},</p>'
        '<p style="margin:0 0 24px;line-height:1.6">Welcome to TMAS. Confirm your email address to activate your account.</p>'
        '<table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" '
        'style="margin:0 auto 28px"><tr>'
        f'<td align="center" bgcolor="#5b21b6" style="border-radius:10px">'
        f'<a href="{safe_verify_url}" target="_blank" rel="noopener noreferrer" role="button" '
        'style="display:block;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;'
        'border:1px solid #5b21b6;border-radius:10px">Verify Email Address</a>'
        '</td></tr></table>'
        '<p style="margin:0 0 8px;color:#6b7280;font-size:13px">If the button does not work, open this link:</p>'
        f'<p style="margin:0 0 24px;word-break:break-all"><a href="{safe_verify_url}" target="_blank" '
        f'style="color:#5b21b6;text-decoration:underline">{safe_verify_url}</a></p>'
        '<p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5">If you did not create this account, you can safely ignore this message.</p>'
        '<p style="margin:24px 0 0">Thanks,<br/><strong>TMAS Team</strong></p>'
        '</td></tr></table></td></tr></table>'
    )

    return {
        'personalizations': [
            {
                'to': [{'email': to_email, 'name': to_name}],
                'subject': 'Verify your TMAS email address',
            }
        ],
        'from': {'email': from_email, 'name': from_name},
        'reply_to': {'email': reply_to, 'name': from_name},
        # A single HTML body prevents gateways from choosing the plain-text alternative
        # and presenting the call-to-action as an unclickable-looking line of text.
        'content': [{'type': 'text/html', 'value': html_body}],
    }


def send_verification_email(to_email: str, to_name: str, verify_token: str) -> None:
    if not SENDGRID_API_KEY:
        raise RuntimeError('SendGrid API key is not configured.')
    if not EMAIL_FROM:
        raise RuntimeError('EMAIL_FROM is not configured.')

    body = _build_verification_email_payload(to_email, to_name or 'Student', verify_token)
    headers = {
        'Authorization': f'Bearer {SENDGRID_API_KEY}',
        'Content-Type': 'application/json',
    }

    response = httpx.post(SENDGRID_API_URL, json=body, headers=headers, timeout=15.0)
    if response.status_code >= 400:
        raise RuntimeError(f'SendGrid send failed: {response.status_code} {response.text}')


def _build_contact_email_payload(sender_name: str, sender_email: str, message: str) -> dict[str, object]:
    recipient = CONTACT_EMAIL.strip()
    from_email = EMAIL_FROM.strip()
    from_name = EMAIL_FROM_NAME.strip() or 'TMAS'
    safe_name = escape(sender_name)
    safe_email = escape(sender_email)
    safe_message = escape(message).replace('\n', '<br/>')
    return {
        'personalizations': [{'to': [{'email': recipient, 'name': from_name}],
                              'subject': f'New TMAS contact message from {sender_name}'}],
        'from': {'email': from_email, 'name': from_name},
        'reply_to': {'email': sender_email, 'name': sender_name},
        'content': [
            {'type': 'text/plain', 'value': f'Name: {sender_name}\nEmail: {sender_email}\n\nMessage:\n{message}'},
            {'type': 'text/html', 'value': _wrap_html_document(
                f'<p><strong>Name:</strong> {safe_name}<br/><strong>Email:</strong> {safe_email}</p>'
                f'<p><strong>Message:</strong></p><p>{safe_message}</p>'
            )},
        ],
    }


def send_contact_email(sender_name: str, sender_email: str, message: str) -> None:
    if not SENDGRID_API_KEY:
        raise RuntimeError('SendGrid API key is not configured.')
    if not EMAIL_FROM:
        raise RuntimeError('EMAIL_FROM is not configured.')
    if not CONTACT_EMAIL:
        raise RuntimeError('CONTACT_EMAIL is not configured.')
    body = _build_contact_email_payload(sender_name, sender_email, message)
    headers = {'Authorization': f'Bearer {SENDGRID_API_KEY}', 'Content-Type': 'application/json'}
    response = httpx.post(SENDGRID_API_URL, json=body, headers=headers, timeout=15.0)
    if response.status_code >= 400:
        raise RuntimeError(f'SendGrid send failed: {response.status_code} {response.text}')

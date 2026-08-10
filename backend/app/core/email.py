import os
from email.message import EmailMessage

import httpx

from app.core.config import EMAIL_FROM, EMAIL_FROM_NAME, EMAIL_REPLY_TO, FRONTEND_URL, SENDGRID_API_KEY

SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'


def _build_email_payload(to_email: str, to_name: str, reset_token: str) -> dict[str, object]:
    # The frontend treats the `token` query param as authoritative regardless of path (see
    # src/utils/passwordReset.ts) — the `/forgot-password` segment here is just for a
    # readable link in the email, and `vercel.json` rewrites any path back to the SPA so it
    # resolves either way.
    reset_url = f"{FRONTEND_URL}/forgot-password?token={reset_token}"
    from_name = EMAIL_FROM_NAME.strip() or 'TMAS'
    from_email = EMAIL_FROM.strip()
    reply_to = EMAIL_REPLY_TO.strip() or from_email

    html_body = (
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

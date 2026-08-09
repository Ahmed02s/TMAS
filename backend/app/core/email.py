import os
from email.message import EmailMessage

import httpx

from app.core.config import EMAIL_FROM, EMAIL_FROM_NAME, EMAIL_REPLY_TO, FRONTEND_URL, SENDGRID_API_KEY

SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'


def _build_email_payload(to_email: str, to_name: str, reset_token: str) -> dict[str, object]:
    reset_url = f"{FRONTEND_URL}/forgot-password?token={reset_token}"
    from_name = EMAIL_FROM_NAME.strip() or 'TMAS'
    from_email = EMAIL_FROM.strip()
    reply_to = EMAIL_REPLY_TO.strip() or from_email

    return {
        'personalizations': [
            {
                'to': [{'email': to_email, 'name': to_name}],
                'subject': 'Reset your TMAS password',
                'dynamic_template_data': {
                    'name': to_name,
                    'reset_url': reset_url,
                },
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
            }
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

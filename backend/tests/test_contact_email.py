from app.core import email as email_core


def test_contact_email_targets_email_from_and_replies_to_visitor(monkeypatch):
    monkeypatch.setattr(email_core, 'EMAIL_FROM', 'inbox@example.com')
    monkeypatch.setattr(email_core, 'EMAIL_FROM_NAME', 'TMAS Support')
    payload = email_core._build_contact_email_payload('Ada Lovelace', 'ada@example.edu', 'Please help.')
    assert payload['personalizations'][0]['to'][0]['email'] == 'inbox@example.com'
    assert payload['from']['email'] == 'inbox@example.com'
    assert payload['reply_to']['email'] == 'ada@example.edu'


def test_contact_email_escapes_html(monkeypatch):
    monkeypatch.setattr(email_core, 'EMAIL_FROM', 'inbox@example.com')
    payload = email_core._build_contact_email_payload('<Admin>', 'visitor@example.edu', '<script>alert(1)</script>')
    html = payload['content'][1]['value']
    assert '<script>' not in html
    assert '&lt;script&gt;' in html

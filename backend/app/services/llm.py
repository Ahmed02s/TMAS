"""Shared chat-completion helper — the same Groq (primary) -> Gemini -> OpenAI provider
cascade AI quiz generation uses (see app.routers.quizzes._call_llm_for_questions), pulled
out here so any other feature that needs an LLM call (e.g. the AI Tutor) reuses one
implementation instead of duplicating/diverging from the provider fallback chain.
"""
import logging

import httpx

from app.core.config import GEMINI_API_KEY, OPENAI_API_KEY, QROK_API_KEY, QROK_API_URL

logger = logging.getLogger(__name__)


def call_llm(
    system: str,
    user: str,
    *,
    max_tokens: int = 512,
    temperature: float = 0.3,
    json_mode: bool = False,
    timeout: float = 20.0,
) -> str | None:
    """Returns the raw text content of the first successful provider's response, or None
    if every configured provider is unset or failed (network error, non-200, timeout)."""

    if QROK_API_KEY:
        try:
            api_url = QROK_API_URL or 'https://api.groq.com/openai/v1/chat/completions'
            headers = {'Authorization': f'Bearer {QROK_API_KEY}', 'Content-Type': 'application/json'}
            body: dict = {
                'model': 'Qwen3.6 27B',
                'messages': [
                    {'role': 'system', 'content': system},
                    {'role': 'user', 'content': user},
                ],
                'temperature': temperature,
                'max_tokens': max_tokens,
            }
            if json_mode:
                body['response_format'] = {'type': 'json_object'}
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(api_url, headers=headers, json=body)
                if resp.status_code == 200:
                    return resp.json()['choices'][0]['message']['content']
        except Exception:
            logger.exception('call_llm: Groq request failed')

    if GEMINI_API_KEY:
        try:
            gemini_url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}'
            g_body: dict = {'contents': [{'parts': [{'text': f'{system}\n\n{user}'}]}]}
            if json_mode:
                g_body['generationConfig'] = {'response_mime_type': 'application/json'}
            with httpx.Client(timeout=timeout) as client:
                g_resp = client.post(gemini_url, json=g_body)
                if g_resp.status_code == 200:
                    return g_resp.json()['candidates'][0]['content']['parts'][0]['text']
        except Exception:
            logger.exception('call_llm: Gemini request failed')

    if OPENAI_API_KEY:
        try:
            o_url = 'https://api.openai.com/v1/chat/completions'
            o_headers = {'Authorization': f'Bearer {OPENAI_API_KEY}', 'Content-Type': 'application/json'}
            o_body: dict = {
                'model': 'gpt-4o-mini',
                'messages': [
                    {'role': 'system', 'content': system},
                    {'role': 'user', 'content': user},
                ],
            }
            if json_mode:
                o_body['response_format'] = {'type': 'json_object'}
            with httpx.Client(timeout=timeout) as client:
                o_resp = client.post(o_url, headers=o_headers, json=o_body)
                if o_resp.status_code == 200:
                    return o_resp.json()['choices'][0]['message']['content']
        except Exception:
            logger.exception('call_llm: OpenAI request failed')

    return None

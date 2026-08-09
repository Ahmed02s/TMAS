import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]
DOTENV_PATH = BASE_DIR / '.env'
load_dotenv(dotenv_path=DOTENV_PATH)
if not DOTENV_PATH.exists():
    load_dotenv(dotenv_path=BASE_DIR / '.env.example')

SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')
QROK_API_KEY = os.getenv('QROK_API_KEY', os.getenv('GROQ_API_KEY', ''))
QROK_API_URL = os.getenv('QROK_API_URL', os.getenv('GROQ_API_URL', 'https://api.groq.com/openai/v1/chat/completions'))
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

# HMAC signing key for session JWTs (see app.core.security). Falls back to a fixed
# development value so the app keeps working out of the box, but this means anyone with
# the source can forge tokens — set a real JWT_SECRET env var in production (e.g.
# `python -c "import secrets; print(secrets.token_hex(32))"`).
JWT_SECRET = os.getenv('JWT_SECRET', 'tmas-dev-only-insecure-default-change-me')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRES_MINUTES = int(os.getenv('JWT_EXPIRES_MINUTES', str(60 * 24 * 7)))  # 7 days

# Comma-separated list of extra allowed CORS origins (beyond the built-in defaults).
EXTRA_CORS_ORIGINS = [o.strip() for o in os.getenv('CORS_ORIGINS', '').split(',') if o.strip()]

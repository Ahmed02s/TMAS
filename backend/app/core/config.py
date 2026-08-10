import logging
import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[2]
DOTENV_PATH = BASE_DIR / '.env'
load_dotenv(dotenv_path=DOTENV_PATH)
if not DOTENV_PATH.exists():
    load_dotenv(dotenv_path=BASE_DIR / '.env.example')

SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')
SENDGRID_API_KEY = os.getenv('SENDGRID_API_KEY', '')
EMAIL_FROM = os.getenv('EMAIL_FROM', '')
EMAIL_FROM_NAME = os.getenv('EMAIL_FROM_NAME', '')
EMAIL_REPLY_TO = os.getenv('EMAIL_REPLY_TO', EMAIL_FROM)
# Used to build the link inside password-reset emails (see app.core.email). This backend
# runs on Render, not on whatever machine sends the email, so defaulting to localhost meant
# every reset email sent from a deployment without an explicit FRONTEND_URL env var contained
# a link back to the sender's own machine instead of the live site — set FRONTEND_URL on
# Render to the real deployed frontend origin (no trailing slash) to override this default.
FRONTEND_URL = os.getenv('FRONTEND_URL', 'https://tmas-dusky.vercel.app')
QROK_API_KEY = os.getenv('QROK_API_KEY', os.getenv('GROQ_API_KEY', ''))
QROK_API_URL = os.getenv('QROK_API_URL', os.getenv('GROQ_API_URL', 'https://api.groq.com/openai/v1/chat/completions'))
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

# HMAC signing key for session JWTs (see app.core.security). A fixed, source-visible
# fallback would let anyone who reads this repo forge valid session tokens for any user
# (including admins), so instead of a hardcoded default we generate a random secret for
# this process if JWT_SECRET isn't set. That keeps the app working out of the box, but
# every restart invalidates existing sessions — set a real JWT_SECRET env var in
# production (e.g. `python -c "import secrets; print(secrets.token_hex(32))"`) so
# restarts/redeploys don't log everyone out and so all worker processes share one key.
JWT_SECRET = os.getenv('JWT_SECRET') or secrets.token_hex(32)
if not os.getenv('JWT_SECRET'):
    logger.warning(
        'JWT_SECRET is not set — using a random per-process secret. All sessions will be '
        'invalidated on restart, and this will break auth if you run more than one worker '
        'process. Set a persistent JWT_SECRET env var before deploying.'
    )
JWT_ALGORITHM = 'HS256'
JWT_EXPIRES_MINUTES = int(os.getenv('JWT_EXPIRES_MINUTES', str(60 * 24 * 7)))  # 7 days

# Comma-separated list of extra allowed CORS origins (beyond the built-in defaults).
EXTRA_CORS_ORIGINS = [o.strip() for o in os.getenv('CORS_ORIGINS', '').split(',') if o.strip()]

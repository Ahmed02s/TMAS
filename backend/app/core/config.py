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

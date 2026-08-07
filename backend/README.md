# TMAS backend

## Structure
- app/core: configuration
- app/routers: auth and levels routes
- main.py: FastAPI entrypoint

## Run locally
1. Create a virtual environment
2. Install dependencies: `pip install -r requirements.txt`
3. Create a `.env` file with your Supabase credentials
4. Start the server: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`

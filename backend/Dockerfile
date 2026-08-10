# Only needed for PPTX/PPT -> PDF conversion at upload time (app/services/office_convert.py).
# Render's default *native* Python runtime has no apt/root access, so LibreOffice can't be
# installed there — this Dockerfile exists specifically so the service can be switched to
# Render's Docker deploy type. Everything else about the app is unchanged; if conversion
# isn't needed, the native Python runtime continues to work fine (office_convert.py just
# no-ops when `soffice` isn't found).
FROM python:3.12-slim

# libreoffice-impress (not the full LibreOffice suite) keeps the image smaller, since
# materials in this app are never .odt/.xlsx — only .pptx/.ppt need converting.
# fonts-liberation improves fidelity for decks using common Office fonts (Calibri, Arial, etc).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-impress \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render injects the real $PORT at runtime; this default only matters when running the
# image outside Render (e.g. `docker run -p 8000:8000 ...` locally).
ENV PORT=8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]

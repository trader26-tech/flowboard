# ── Stage 1: build the Angular app ────────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: FastAPI backend serving the built SPA ────────────────────────────
FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    STATIC_DIR=/app/static

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
# Copy the compiled frontend so FastAPI can serve it at /
COPY --from=frontend /fe/dist/flowboard/browser ./static

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

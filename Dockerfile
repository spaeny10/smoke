# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY frontend/ ./

# Empty string = API calls go to same origin (no CORS needed)
ENV VITE_API_URL=""

# Google OAuth client ID must be available at build time for Vite
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

# Stage 2: Python backend + built frontend
FROM python:3.12-slim

WORKDIR /app

# System deps for asyncpg and bcrypt
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY packages/ ./packages/
COPY services/ ./services/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# Copy built frontend into /app/static
COPY --from=frontend-build /app/frontend/dist ./static

# PYTHONPATH so "from packages.db.session import ..." works
ENV PYTHONPATH=/app

# Railway injects PORT
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head 2>/dev/null; uvicorn services.api.main:app --host 0.0.0.0 --port ${PORT}"]

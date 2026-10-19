# Multi-stage Dockerfile for ARGUS Automated EDA Tool
# Stage 1: Build Frontend Assets
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --silent || npm install --silent

COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python Backend + Static Host
FROM python:3.12-slim AS runner

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8001

# Install system dependencies if required for data analysis / plotting
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code, configurations and datasets
COPY backend ./backend
COPY demo_data.csv customer_churn.csv daily-bike-share.csv ./
COPY ARGUS_Workflow_Diagram.html glimpse_logo.png ./
COPY api_keys.txt ./api_keys.txt

# Copy built frontend assets from builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8001}"]

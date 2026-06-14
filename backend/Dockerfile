# Sentinel AI Backend — Dockerfile
# For deployment on Railway

FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Expose port
EXPOSE 8000

# Start — use shell form so $PORT is expanded by the shell at runtime
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

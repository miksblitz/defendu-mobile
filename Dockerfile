# Pose extraction service for Defendu (Render Docker)
# Expects repo root = defendu-mobile (so pose-service/ and scripts/ are here)
FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV (headless)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY pose-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pose-service/ pose-service/
COPY scripts/ scripts/

ENV PORT=10000
EXPOSE $PORT

# Render sets PORT at runtime
CMD ["sh", "-c", "gunicorn -w 1 -b 0.0.0.0:${PORT:-10000} pose-service.app:app"]

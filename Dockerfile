# Pose extraction service for Defendu (Render Docker)
# When Render build context = repo root (parent of defendu-mobile), use defendu-mobile/ prefix.
FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV (headless)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY defendu-mobile/pose-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY defendu-mobile/pose-service/ pose-service/
COPY defendu-mobile/scripts/ scripts/

ENV PORT=10000
EXPOSE $PORT

# Render sets PORT at runtime
CMD ["sh", "-c", "gunicorn -w 1 -b 0.0.0.0:${PORT:-10000} pose-service.app:app"]

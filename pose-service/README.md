# Pose extraction service

**Optional / admin use.** The mobile app no longer calls this service on publish; pose reference is set by the training pipeline. See **docs/TRAINING_POSE.md**. This service can be used by admins or the pipeline to extract pose from a video and write reference to a module.

## Flow (when invoked manually or by pipeline)

1. Call `POST /extract` with `{ videoUrl, moduleId, focus }`.
2. The service downloads the video, runs MediaPipe pose extraction, and writes the pose reference to the module in Realtime Database.
3. When a student opens "Try with pose", the app loads that reference and compares their movement.

## Deploy on Render

1. **New Web Service** → connect this repo (or the `defendu-mobile` folder).
2. **Root directory:** `defendu-mobile` (so `pose-service` and `scripts` are both available).
3. **Build command:** `pip install -r pose-service/requirements.txt`
4. **Start command:** `gunicorn -w 1 -b 0.0.0.0:$PORT pose-service.app:app`  
   (Or if Render sets working dir to repo root: `cd defendu-mobile && gunicorn -w 1 -b 0.0.0.0:$PORT pose-service.app:app` — adjust to your repo layout.)
5. **Environment variables:**

   | Variable | Description |
   |----------|-------------|
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON string of your Firebase service account key (from Project settings → Service accounts → Generate new key). |
   | `FIREBASE_DATABASE_URL` | Realtime Database URL (e.g. `https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app`). |
6. **No Firebase Storage needed.** The service writes the pose reference (sequence + focus) directly to Realtime Database on the module. No Blaze plan required.

7. The mobile app does **not** use this URL anymore; reference data is set by the training pipeline. You can still deploy this service for admin or pipeline use.

## API

- **GET /health** — Returns `{ "status": "ok" }`.
- **POST /extract** — Body: `{ "videoUrl": string, "moduleId": string, "focus"?: "punching"|"kicking"|"full" }`. Runs extraction from one video, writes pose reference to the module in Realtime Database. Returns 202 while processing in background.
- **POST /write-ref** — Body: same as the output of `scripts/extract_reference_pose.py` plus `moduleId`: `{ "moduleId": string, "focus"?: "punching"|"kicking"|"full", "sequence"?: [...], "sequences"?: [...] }`. Writes that reference directly to the module in DB. Use this after running the extract script locally on a folder of videos (e.g. 5–15 lead jab clips); no need to host the JSON anywhere.

## Local run

```bash
cd defendu-mobile
export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
export FIREBASE_DATABASE_URL="https://your-project.firebasedatabase.app"
pip install -r pose-service/requirements.txt
python -m flask --app pose-service.app run --port 10000
```

Then call `POST http://localhost:10000/extract` with a test body.

# Pose extraction service

**Trainers only upload the technique video.** This service runs the pose-estimation pipeline and saves the reference so "Try with pose" can compare the student’s form.

## Flow

1. Trainer publishes a module and uploads the **technique video** (correct form).
2. The app saves the module and calls this service: `POST /extract` with `{ videoUrl, moduleId, focus }`.
3. The service downloads the video, runs MediaPipe pose extraction (same model as the app), uploads the JSON to Firebase Storage, and sets `referencePoseSequenceUrl` on the module in Realtime Database.
4. When a student opens "Try with pose", the app loads that reference and compares their movement: green = good form, red = no match.

No trainer has to deal with JSON or URLs.

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
   | `FIREBASE_STORAGE_BUCKET` | (Optional) Storage bucket name, e.g. `defendu-e7970.firebasestorage.app`. If omitted, uses `project_id.appspot.com`. |

6. **Firebase Storage rules:** Ensure reads are allowed for the pose-refs path (or make the bucket readable for the app). The service uploads to `pose-refs/{moduleId}.json` and calls `make_public()` so the app can fetch the URL.

7. Copy the Render service URL (e.g. `https://defendu-pose.onrender.com`) and set in the **mobile app** env:
   - `EXPO_PUBLIC_POSE_EXTRACTION_URL=https://defendu-pose.onrender.com`

## API

- **GET /health** — Returns `{ "status": "ok" }`.
- **POST /extract** — Body: `{ "videoUrl": string, "moduleId": string, "focus"?: "punching"|"kicking"|"full" }`. Runs extraction, uploads JSON, updates the module. Returns `{ "referencePoseSequenceUrl": string }` or an error.

## Local run

```bash
cd defendu-mobile
export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
export FIREBASE_DATABASE_URL="https://your-project.firebasedatabase.app"
pip install -r pose-service/requirements.txt
python -m flask --app pose-service.app run --port 10000
```

Then call `POST http://localhost:10000/extract` with a test body.

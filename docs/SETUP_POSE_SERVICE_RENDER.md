# Set up automatic pose reference (Option A) — step by step

This gets **referencePoseSequenceUrl** set automatically when a trainer publishes a module with a technique video. You deploy the pose service on Render and point the app at it.

---

## Step 1 — Get your Firebase service account key

1. Open [Firebase Console](https://console.firebase.google.com/) → your project.
2. Click the **gear** → **Project settings**.
3. Go to **Service accounts**.
4. Click **Generate new private key** → confirm. A JSON file downloads.
5. Open that file in a text editor. You need the **entire JSON** as one string for Render (Step 3). Keep the file safe; don’t commit it.

---

## Step 2 — Get your Realtime Database URL

1. In Firebase Console, go to **Build** → **Realtime Database**.
2. If you use the default database, the URL looks like:  
   `https://YOUR-PROJECT-ID-default-rtdb.REGION.firebasedatabase.app`  
   or e.g. `https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app`.
3. Copy that URL. You’ll paste it into Render as **FIREBASE_DATABASE_URL**.

(Optional) **Storage bucket name:** Build → Storage. The bucket is often `YOUR-PROJECT-ID.firebasestorage.app` or `YOUR-PROJECT-ID.appspot.com`. You can set **FIREBASE_STORAGE_BUCKET** on Render if you use a custom bucket; otherwise the service will use the default.

---

## Step 3 — Deploy the pose service on Render

1. Go to [Render](https://render.com/) and sign in.
2. **New +** → **Web Service**.
3. **Connect** your repo (GitHub). If your repo is **defendu-mobile** (so the Dockerfile and `pose-service/` are at the repo root), use that repo. If your repo is a parent (e.g. `DEFENDU-MOB`) and defendu-mobile is a folder inside it, choose the parent and set Root directory in the next step.
4. **Settings:**
   - **Name:** e.g. `defendu-pose` or `defendu-mobile` (you already have `defendu-mobile` — that’s fine).
   - **Root directory:**  
     - If the repo **is** defendu-mobile (e.g. `miksblitz/defendu-mobile`): leave **empty** (don’t set it).  
     - If the repo is a parent and defendu-mobile is a subfolder: set **Root directory** to `defendu-mobile`.
   - **Docker:** This project has a **Dockerfile** for the pose service. Render will use it automatically (Dockerfile path `./Dockerfile`). You do **not** need to set “Build command” or “Start command” when using Docker — the Dockerfile already runs `gunicorn` with a 300s timeout.
   - **Instance type:** Free is enough for testing. Extraction can take 1–2 minutes; free instances may spin down when idle.

   **Your setup (repo = miksblitz/defendu-mobile):** Leave **Root directory** blank. Render will use the repo root, where the Dockerfile and `pose-service/` already live. The Dockerfile handles build and start; you only need to set the env vars below.

5. **Environment** (Add Environment Variable). Add these:

   | Key | Value |
   |-----|--------|
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | Paste the **entire** contents of the JSON file from Step 1 (one line is fine). |
   | `FIREBASE_DATABASE_URL` | Your Realtime Database URL from Step 2. |
   | `FIREBASE_STORAGE_BUCKET` | Your Storage bucket (Firebase Console → Storage). If you see "The specified bucket does not exist", set this to the exact bucket name, e.g. `defendu-e7970.firebasestorage.app`. |

   For **FIREBASE_SERVICE_ACCOUNT_JSON**: open the downloaded JSON, select all, copy, and paste into the value field. It should start with `{"type":"service_account",...}`.

6. If this is a new service: click **Create Web Service**. Wait for the first deploy to finish.
7. Copy the **service URL** (e.g. `https://defendu-mobile-8afy.onrender.com`). No trailing slash. You’ll use it in Step 4.

---

## Step 4 — Point the app at the pose service

1. On your PC, open the **defendu-mobile** folder.
2. Open (or create) the file **`.env`** in **defendu-mobile**.
3. Add or edit this line (use your real Render URL from Step 3):

   ```bash
   EXPO_PUBLIC_POSE_EXTRACTION_URL=https://defendu-pose.onrender.com
   ```

4. Save the file.
5. Restart Metro / Expo so the app picks up the variable:
   - Stop the current `npm start` or `npx expo start` (Ctrl+C).
   - Run again: `npx expo start` (or `npm start`).

---

## Step 5 — Publish a module with a technique video

1. In the app, sign in as a **trainer**.
2. Create and **publish** a module and upload a **technique video** (e.g. one clean jab).
3. After you tap submit, the app saves the module and calls the Render service in the background. You may see a toast like “Pose reference is being generated…”
4. Wait **1–2 minutes**. The service will:
   - Download the technique video
   - Run pose extraction (MediaPipe)
   - Upload the JSON to Firebase Storage
   - Set **referencePoseSequenceUrl** on that module in the Realtime Database
5. Open that module in the app → **Try with pose**. You should see **“Reference loaded (punching)”** (or similar) instead of “Practice mode (no reference yet)”.

---

## If it still says “Practice mode”

- **Check the module in Firebase:** Realtime Database → **modules** → your module. After 1–2 minutes it should have a key **referencePoseSequenceUrl** with a URL. If it doesn’t, the service didn’t run or failed.
- **Check Render logs:** Render dashboard → your pose service → **Logs**. After you publish a module you should see lines like `[Extract] Accepted for module_id=...` then `[Extract] Done... referencePoseSequenceUrl=...`. If you see **Error**, read the traceback (e.g. video download failed, Firebase permission, or MediaPipe error).
- **Check the app env:** Confirm **EXPO_PUBLIC_POSE_EXTRACTION_URL** is set in `.env` and that you restarted Metro after changing it. If it’s missing, the app never calls the service.
- **Render free tier:** The service may be asleep. The first request after idle can take 30–60 seconds to wake; then extraction runs. Try again or wait a bit longer.

---

## Summary checklist

| Step | What you did |
|------|----------------|
| 1 | Downloaded Firebase service account JSON. |
| 2 | Noted Realtime Database URL (and optional Storage bucket). |
| 3 | Deployed pose service on Render with root `defendu-mobile`, build/start commands, and the three env vars. |
| 4 | Set `EXPO_PUBLIC_POSE_EXTRACTION_URL` in defendu-mobile `.env` and restarted Metro. |
| 5 | Published a module with a technique video and waited 1–2 minutes; then opened “Try with pose” and saw reference loaded. |

After this, any **new** module published with a technique video will get **referencePoseSequenceUrl** set automatically by the pose service.

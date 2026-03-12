# Automatic pose reference from the trainer’s technique video

You don’t run scripts or host JSON yourself. The **trainer’s technique video** is used automatically and the **pose reference is stored in the database** for you.

---

## Why does it say “Practice mode (no reference yet)”?

The app does **not** use the technique video directly for pose comparison. It uses a **pose reference**: a JSON file of landmarks extracted from that video.

| In Firebase | What it is |
|-------------|------------|
| **techniqueVideoUrl** | The trainer’s video (e.g. a jab). Stored when the module is published. |
| **referencePoseSequenceUrl** | URL to a **JSON file** (pose data). This is what “Try with pose” loads. If it’s missing → **Practice mode**. |

So: the **technique video** is the source; the **reference** is the extracted pose JSON. The app only leaves practice mode when the module has **referencePoseSequenceUrl** set.

**How to add the reference:**

1. **Automatic (recommended):** Use the pose extraction service (see below). When a trainer publishes a module with a technique video, the app calls the service; the service extracts pose from the video and sets **referencePoseSequenceUrl** on that module. If the service isn’t deployed or the call fails, this never happens → you stay in practice mode.  
   **→ Step-by-step setup:** [SETUP_POSE_SERVICE_RENDER.md](./SETUP_POSE_SERVICE_RENDER.md)
2. **Manual:** Run `python scripts/extract_reference_pose.py <technique-video-url-or-path> -o ref.json --focus punching`, upload `ref.json` to a public URL, then in Firebase Realtime Database open that module and add the key **referencePoseSequenceUrl** with that URL as the value.

---

## How it works (simple)

1. **Trainer** publishes a module and uploads the **technique video** (one good jab, etc.).
2. The **app** saves the module and calls your **pose extraction service** on Render with: “here’s the video URL and module ID, extract pose and save it.”
3. The **service** (on Render) downloads the video, runs pose extraction with the right **focus** (e.g. `punching` for jab), uploads the JSON to **Firebase Storage**, then writes **`referencePoseSequenceUrl`** on that module in **Firebase Realtime Database**.
4. When a **student** opens “Try with pose”, the app loads that URL and compares their movement.

So: **technique video is in the DB** → **Render runs the extraction** → **JSON is stored in Firebase Storage** → **DB is updated with the URL**. You don’t host the JSON on Render; Render runs the **service** that produces the JSON and puts it in Firebase.

---

## What you need to do

### 1. Deploy the pose service on Render

- **Render** is the right place to run the pose **service** (the app that does the extraction). The JSON itself is stored in **Firebase Storage**, not on Render.
- Follow **pose-service/README.md**: create a Web Service, set build/start commands, add the environment variables below.

### 2. Set environment variables

**On Render (pose service):**

| Variable | What to set |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON string of your Firebase **service account** key (Project settings → Service accounts → Generate new private key). Copy the whole JSON. |
| `FIREBASE_DATABASE_URL` | Your **Realtime Database** URL (e.g. `https://your-project.firebasedatabase.app`). Must be the same DB where the app stores `modules`. |
| `FIREBASE_STORAGE_BUCKET` | (Optional) Your Storage bucket name, e.g. `your-project.firebasestorage.app`. If you leave it blank, the code uses `project_id.appspot.com`. |

**In the app (defendu-mobile):**

In your **.env** file (copy from `.env.example` if needed):

```bash
EXPO_PUBLIC_POSE_EXTRACTION_URL=https://your-pose-service.onrender.com
```

- Use your **actual** Render service URL (no trailing slash).
- Restart Metro / the app after changing `.env` so the variable is picked up.

### 3. Publish a module with a technique video

- As a trainer, create a module and upload a **technique video** (e.g. one clean jab).
- Submit the module. The app will call your Render service in the background.
- Wait **1–2 minutes**. The service downloads the video, extracts pose, uploads to Firebase Storage, then updates the module in the DB with `referencePoseSequenceUrl`.

---

## “referencePoseSequenceUrl” never appears in the database

If the field is still missing after a few minutes, check the following.

### 1. App: is the service being called?

- If **EXPO_PUBLIC_POSE_EXTRACTION_URL** is missing or wrong, the app never calls Render, so the DB is never updated.
- In `.env` set:  
  `EXPO_PUBLIC_POSE_EXTRACTION_URL=https://your-render-url.onrender.com`
- **Restart Metro** after changing `.env`. If you use a **dev build** (`npx expo run:android` or `run:ios`), the URL is baked in at **build time** — change `.env`, then **rebuild** the app (`npx expo run:android` etc.) or the old (empty) URL may still be used.
- When publishing a module with a technique video, check the app/Metro console for a warning like:  
  `[PoseExtraction] EXPO_PUBLIC_POSE_EXTRACTION_URL is not set`  
  If you see that, the URL isn’t set correctly for the running app.
- **In the app:** Open the module → **Try with pose**. If you see “Practice mode (no reference yet)” and a button **“Generate pose reference from video”**, tap it to trigger the extraction now. Wait 1–2 minutes, go back, then open “Try with pose” again; the reference should load if the service succeeded.

### 2. Render: did the request succeed?

- In Render dashboard → your pose service → **Logs**.
- After you publish a module you should see something like:  
  `[Extract] Accepted for module_id=... focus=punching (running in background)`  
  then later:  
  `[Extract] Done module_id=... referencePoseSequenceUrl set`
- If you see **Error** or a stack trace, the failure is in the service (download, extraction, or Firebase). Fix that first.

### 3. Can Render download the technique video?

- The technique video URL (e.g. from Cloudinary) must be **publicly downloadable** by the server (no browser-only or auth-only links).
- If the service logs “Error” when downloading, try opening the same `techniqueVideoUrl` in a browser in incognito; if it doesn’t load, fix the video URL or visibility.

### 4. Firebase: Realtime Database and Storage

- **FIREBASE_DATABASE_URL** must be the **Realtime Database** URL (the same one the app uses for `modules`). Not Firestore.
- The service account must be able to:
  - **Write** to Realtime Database at `modules/<moduleId>` (to set `referencePoseSequenceUrl`).
  - **Write** to Firebase Storage (to upload `pose-refs/<moduleId>.json`).
- In Firebase Console: Project settings → Service accounts → ensure the key you put in `FIREBASE_SERVICE_ACCOUNT_JSON` has access to both Realtime Database and Storage (default keys usually do).

### 5. Check the module in Firebase

- In Firebase Console → **Realtime Database** → find the module under **modules** (e.g. `modules/module_<uid>_<timestamp>`).
- After 1–2 minutes, that node should have a key **referencePoseSequenceUrl** with a URL pointing to Firebase Storage (e.g. `https://firebasestorage.googleapis.com/.../pose-refs%2Fmodule_xxx.json`).
- If the module exists but **referencePoseSequenceUrl** is still missing, the service either didn’t run, failed before the update, or couldn’t write to the DB (check Render logs and Firebase permissions).

---

## Summary

| Step | What you do |
|------|-------------|
| 1 | Deploy the pose service on Render (see pose-service/README.md). |
| 2 | Set Render env: `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DATABASE_URL`, (optional) `FIREBASE_STORAGE_BUCKET`. |
| 3 | In the app `.env` set `EXPO_PUBLIC_POSE_EXTRACTION_URL=https://your-render-service.onrender.com` and restart Metro. |
| 4 | Publish a module with a technique video; wait 1–2 minutes; check Realtime Database for `referencePoseSequenceUrl` on that module. |

The **technique video** is the only thing the trainer provides; the **reference data** is extracted and stored automatically. Render is used to run the extraction **service**; the JSON is hosted in **Firebase Storage**, and the **database** is updated with **referencePoseSequenceUrl** so the app can use it for “Try with pose”.

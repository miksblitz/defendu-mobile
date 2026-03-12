# Lead Jab — Pose Estimation: Train and Use in the App

You’ve uploaded lead jab videos into `reference/punching/lead-jab/`. Follow these steps to **extract** a reference from them and make the **“Try with pose”** feature work for lead jab.

---

## What “training” means here

You are **not** training a new AI model. You are:

1. **Extracting** pose (33 body landmarks per frame) from your videos using MediaPipe (same model the app uses).
2. **Saving** that as a reference JSON.
3. **Pointing** the app’s lead-jab module to that JSON so it can say “correct” or “no match” when you do a jab on camera.

---

## Step 1 — Install Python dependencies (one-time)

From the **defendu-mobile** folder:

```bash
cd d:\DEFENDU-MOB\defendu-mobile
pip install -r scripts/requirements.txt
```

Or manually:

```bash
pip install opencv-python mediapipe numpy
```

**Windows:** If you see an error like `function 'free' not found`, use an older MediaPipe version:

```bash
python -m pip uninstall mediapipe -y
python -m pip install mediapipe==0.10.21
```

---

## Step 2 — Extract reference from your lead-jab videos

Your videos are in **reference/punching/lead-jab/**.

**Option A — Use all videos in the folder (recommended)**  
One reference sequence per video; the app will accept a rep if it matches **any** of them (good for different angles/hands).

```bash
cd d:\DEFENDU-MOB\defendu-mobile
python scripts/extract_reference_pose.py reference/punching/lead-jab -o reference/punching/ref_lead_jab.json --focus punching
```

**Option B — Use a single video**  
If you prefer one “golden” clip (e.g. `reference/punching/lead-jab/your_best_jab.mp4`):

```bash
python scripts/extract_reference_pose.py reference/punching/lead-jab/your_best_jab.mp4 -o reference/punching/ref_lead_jab.json --focus punching
```

**Optional flags:**

- Trim to one rep: `--start 0 --end 2` (first 2 seconds).
- Fewer frames (faster in app): `--every 2` (every 2nd frame).

**Check it worked:**  
The script should print something like:

- **Folder:** `Wrote N reference sequences to reference/punching/ref_lead_jab.json.`
- **Single file:** `Wrote N frames to reference/punching/ref_lead_jab.json (focus=punching).`

Open `reference/punching/ref_lead_jab.json` in a text editor: you should see either `"sequence": [ ... ]` or `"sequences": [ ... ]` with arrays of landmarks.

**What the terminal warnings mean:** Messages like `Feedback manager requires a model with a single signature inference` and `Using NORM_RECT without IMAGE_DIMENSIONS` come from MediaPipe/TensorFlow Lite internals. They’re harmless—pose extraction still works. The useful lines are `[1/12] filename.mov: N frames`, which confirm each video was processed.

---

## Step 3 — Host the JSON and get a URL

The app loads the reference from a **URL**, not from the project folder. Any host that serves the file over **HTTPS** with a **public URL** (no login required to download) will work.

### Option A — Firebase Storage (if you already use Firebase)

1. Go to [Firebase Console](https://console.firebase.google.com/) → your project (e.g. Defendu).
2. **Build → Storage** → **Files** → **Upload file**.
3. Upload **reference/punching/ref_lead_jab.json**.
4. Click the file → copy the **Download URL** (e.g. `https://firebasestorage.googleapis.com/.../ref_lead_jab.json?alt=media&token=...`).

### Option B — Render (free static site, step-by-step)

Render serves your JSON from a **Static Site** connected to a Git repo. Free tier, no credit card. One Static Site can serve **many** reference files (lead jab, cross, kicks, etc.)—just add more JSONs to the repo and each gets its own URL; no need to switch to a Web Service later.

**1. Put the JSON in a Git repo**

- **Option A (simplest):** Use your existing **DEFENDU-MOB** repo. Copy the built file into a path that will be public, e.g.:
  - From: `defendu-mobile/reference/punching/ref_lead_jab.json` (or wherever the script wrote it)
  - Commit and push so the file is in the repo (e.g. at `defendu-mobile/reference/punching/ref_lead_jab.json` or `reference/punching/ref_lead_jab.json` at repo root).
- **Option B:** Create a **new** GitHub repo (e.g. `defendu-pose-refs`), add **only** `ref_lead_jab.json` in the root, push. Then you’ll use this repo in step 3.

**2. Sign in to Render**

- Go to [render.com](https://render.com) → **Get Started** (or **Sign In**).
- Sign in with **GitHub** (recommended so Render can see your repos).

**3. Create a Static Site**

- Dashboard → **New +** → **Static Site**.
- **Connect a repository:** Choose the repo that contains `ref_lead_jab.json` (your DEFENDU-MOB repo or the small repo from Option B). Authorize Render if asked.
- **Configure:**
  - **Name:** e.g. `defendu-lead-jab-ref` (this becomes part of the URL).
  - **Branch:** `main` (or whatever branch has the file).
  - **Build command:** leave empty, or type `echo done` (Static Site doesn’t need a real build).
  - **Publish directory:**  
    - If the JSON is in the **repo root:** leave as `.` (or blank).  
    - If it’s in a subfolder (e.g. `defendu-mobile` or `reference/punching`), set **Publish directory** to that folder (e.g. `defendu-mobile` or `reference/punching`). Render will serve files from that folder as the site root.
- Click **Create Static Site**.

**4. Wait for deploy**

- Render builds and deploys. When the status is **Live**, the site is ready.

**5. Get your JSON URL**

- In the Static Site dashboard, open the **URL** Render gives you (e.g. `https://defendu-lead-jab-ref.onrender.com`).
- Your JSON is at:
  - **Publish directory = .** and file at repo root: `https://<your-site-name>.onrender.com/ref_lead_jab.json`
  - **Publish directory = reference/punching** and file in that folder: `https://<your-site-name>.onrender.com/ref_lead_jab.json`
  - **Publish directory = defendu-mobile** and file at `defendu-mobile/reference/punching/ref_lead_jab.json`: `https://<your-site-name>.onrender.com/reference/punching/ref_lead_jab.json`
- Open that URL in a browser to confirm the JSON loads (you should see the raw JSON). **Copy this URL** — you’ll paste it into Firebase as `referencePoseSequenceUrl` in Step 4.

**6. (Optional) Add a custom domain**

- In the Static Site → **Settings** → **Custom Domains** you can add your own domain. For the app, the default `*.onrender.com` URL is enough.

**Troubleshooting — "Not found" (404)**

1. **File must be in the repo.** In your repo (e.g. on GitHub), open the branch Render uses and confirm `ref_lead_jab.json` exists. If you only have it locally, run:
   ```bash
   git add reference/punching/ref_lead_jab.json
   git commit -m "Add lead jab pose reference"
   git push
   ```
   Then in Render click **Manual Deploy** (or wait for auto-deploy).

2. **Publish directory must match.** In Render → your Static Site → **Settings** → **Build & Deploy**:
   - If your **repo root** is the folder that contains `reference/` (e.g. `defendu-mobile`), set **Publish directory** to `.` (or leave blank). Then the JSON URL is `https://defendu-mobile.onrender.com/reference/punching/ref_lead_jab.json`.
   - If your **repo root** is the parent of `defendu-mobile` (e.g. you have `defendu-mobile/reference/...` in the repo), set **Publish directory** to `defendu-mobile`. Then the JSON URL is `https://defendu-mobile.onrender.com/reference/punching/ref_lead_jab.json`.

3. **Bulletproof option — dedicated refs folder:** Create a folder that only exists to be served (e.g. `public-refs` in the repo root). Copy the JSON there, set **Publish directory** to `public-refs`, redeploy. Then the URL is always `https://defendu-mobile.onrender.com/ref_lead_jab.json`.
   ```bash
   mkdir public-refs
   copy reference\punching\ref_lead_jab.json public-refs\
   git add public-refs
   git commit -m "Add pose refs for static site"
   git push
   ```
   In Render, set **Publish directory** to `public-refs` and deploy.

4. **Build failed:** For a static site with no build step, set Build command to `echo done` or leave it empty and ensure Publish directory is set correctly.

### Option C — Railway

Railway gives a small free credit per month. You’d deploy a minimal app that serves the JSON (e.g. Express + `express.static` or a one-route server). Works well, but for **one static file**, Render Static Site or Firebase is simpler.

### Option D — Other (Vercel, Netlify, GitHub raw)

- **Vercel / Netlify:** Create a static site, put `ref_lead_jab.json` in the project, deploy. You get a URL like `https://your-project.vercel.app/ref_lead_jab.json`.
- **GitHub:** Commit the JSON to a repo, then use the raw URL: `https://raw.githubusercontent.com/yourname/repo/branch/path/ref_lead_jab.json`. Some networks or apps block or throttle raw GitHub; otherwise it’s free.

**Recommendation:** Use **Render Static Site** or **Firebase Storage** (if you’re already on Firebase). Both are free and give a stable HTTPS URL. Paste that URL into `referencePoseSequenceUrl` in Step 4.

---

## Step 4 — Set the URL on the lead-jab module

1. In Firebase Console: **Build → Realtime Database** → **Data** tab.
2. Expand **modules** and find the module that teaches **lead jab** (the one you want “Try with pose” for).
3. Add or edit:
   - **Key:** `referencePoseSequenceUrl`
   - **Value:** the URL you copied in Step 3 (full `https://...`).
4. Save.

---

## Step 5 — Run the app and test “Try with pose”

Pose uses **native camera/MediaPipe**, so it does **not** work in Expo Go. Use a **dev build**:

```bash
cd d:\DEFENDU-MOB\defendu-mobile
npx expo run:android --device
```

Or for emulator: `npx expo run:android` (no `--device`).

Then:

1. Open the app → go to the **lead jab** module.
2. Open **“Try with pose”** and allow camera.
3. You should see **“Reference loaded (punching) — 1 sequence”** (or “N examples” if you used multiple videos). If you see **“Practice mode (no reference yet)”**, the URL isn’t set or the JSON didn’t load.
4. Do a lead jab (full body in frame, especially **hips**; one clear down–up or extend–retract so a rep is detected).
5. **Green + number** = rep matched the reference. **“Rep detected” (red)** = rep counted but didn’t match (try form/speed closer to the reference, or loosen threshold — see below).

---

## Step 6 — Tune if needed

- **Good jabs often show “No match” (red):** In `lib/pose/comparator.ts`, **increase** `DEFAULT_MATCH_THRESHOLD` (e.g. from 0.20 to 0.24 or 0.28).
- **Bad form gets green:** **Decrease** the threshold (e.g. to 0.16 or 0.18).

---

## Quick checklist

| Step | Action | Success check |
|------|--------|----------------|
| 1 | `pip install -r scripts/requirements.txt` | No import errors |
| 2 | Run `extract_reference_pose.py` on `reference/punching/lead-jab` with `--focus punching` | Terminal: “Wrote … to ref_lead_jab.json” |
| 3 | Upload `ref_lead_jab.json` to Firebase Storage | You have a public download URL |
| 4 | Set `referencePoseSequenceUrl` on the lead-jab module in Realtime Database | URL saved on that module |
| 5 | `npx expo run:android --device` → open “Try with pose” for lead jab | “Reference loaded (punching)” and green/red feedback when you jab |

---

## Summary

- **Videos** → script extracts pose → **JSON**.
- **JSON** → upload to Storage → **URL**.
- **URL** → set on module as **referencePoseSequenceUrl**.
- **App** (dev build) loads that URL and compares your camera rep to the reference; **green** = match, **red** = no match.

For more on rep detection, thresholds, and practice mode, see **docs/TRAINING_POSE_JABS.md** and **scripts/README.md**.

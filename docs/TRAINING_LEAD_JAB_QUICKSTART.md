# Train lead jab pose reference — quick start

You have videos in `reference/punching/lead-jab/`. This doc answers: **how many videos**, **Render vs DB**, and **exact steps**.

---

## How many reference videos?

- **Minimum:** 3–5 different lead jab clips (different angles or people).
- **Recommended:** **5–15** clips. More variety (angles, lighting, body types) helps the app accept a wider range of “good” jabs; the app matches your rep to **any** of the reference sequences.
- **Not ML training:** We only extract pose landmarks (33 per frame) from each video. The app doesn’t “memorize” in the sense of training a neural net — it compares your camera frames to these reference sequences. More references = more acceptable patterns.

Use a **folder** of videos so the script outputs **multiple sequences** (`sequences` in JSON). One sequence per video.

---

## Correct poses only, or incorrect ones too?

**Right now: use only correct poses.**

- The pipeline **does not train a neural network**. It only extracts pose landmarks from your videos and stores them as “reference.” The app decides “correct” by: (1) **similarity** to one of those references (landmark distance), and (2) **rule-based checks** (e.g. arm extended at impact, elbow straight, rear hand in guard). So the reference = “what good looks like”; the **rules** already encode many “wrong” cases (not extended, elbow bent, etc.) in `lib/pose/jabFeedback.ts`.
- **Incorrect videos** are not used in the current flow. Adding them would require a separate **ML training** step (e.g. a small classifier trained on “correct” vs “incorrect” clips). That’s a possible future upgrade, but not needed to get lead jab working well today.

**What to focus on instead:**

| Factor | Recommendation |
|--------|-----------------|
| **Content** | Only **correct** lead jabs (clean form, full extension, good guard). |
| **Variety** | Different **angles** (front, ¾), **lighting**, and **body types** so the app accepts a range of good jabs. |
| **One rep per clip** | Each video = one clear jab (or one rep). Easiest for the script and for matching. |
| **Consistent focus** | All clips show **upper body** clearly (punching focus); avoid clips where the arms are cut off. |

If you later add a **trained classifier** (correct vs incorrect), then labeling and including **incorrect** examples (e.g. short arm, dropped guard) would help that model. For the current reference + rules setup, correct-only is enough.

---

## Where does the output go? (Render vs DB)

You have two options. **Writing to the DB is simpler** (no hosting the JSON).

| Option | What you do | When to use |
|--------|-------------|-------------|
| **A — Write to DB** | Run extract script locally → POST the JSON to your **pose-service on Render** (`/write-ref`) → service writes `referencePoseSequences` + `referencePoseFocus` to Firebase. **No need to host the JSON file.** | Recommended: one deploy (pose-service on Render), then all refs go straight to DB. |
| **B — Host JSON, set URL** | Run extract script → upload `ref_lead_jab.json` to **Render Static Site** (or Firebase Storage) → get a URL → set `referencePoseSequenceUrl` on the module in Firebase. | Use if you prefer not to use the pose-service, or want a static URL for the same ref. |

**Should you host the output on Render?** Only if you choose Option B (static URL). With Option A you **do not** host the JSON; the pose-service (Web Service on Render) receives the JSON and writes it to the DB.

---

## Steps (Option A — write to DB, recommended)

### 1. Put videos in the folder

- Place **5–15** lead jab videos (e.g. `.mp4`, `.MOV`) in:
  ```
  reference/punching/lead-jab/
  ```
- Each video = one clean jab (or one rep). Different angles/people is better.

### 2. Install Python deps (one-time)

```bash
cd defendu-mobile
pip install opencv-python mediapipe numpy
```

*(On Windows if you see a MediaPipe error, try `pip install mediapipe==0.10.21`.)*

### 3. Extract pose from all videos

```bash
python scripts/extract_reference_pose.py reference/punching/lead-jab -o reference/punching/ref_lead_jab.json --focus punching
```

- You should see: `Wrote N reference sequences to reference/punching/ref_lead_jab.json`.
- Open the JSON: it should have `"sequences": [ ... ]` and `"focus": "punching"`.

### 4. Deploy pose-service on Render (one-time)

- **New Web Service** on [Render](https://render.com) → connect your repo.
- **Root directory:** `defendu-mobile` (or wherever `pose-service/` and `scripts/` live).
- **Build:** `pip install -r pose-service/requirements.txt` (or install Flask + firebase-admin).
- **Start:** `gunicorn -w 1 -b 0.0.0.0:$PORT pose-service.app:app`
- **Env vars:**  
  - `FIREBASE_SERVICE_ACCOUNT_JSON` = full JSON string of your Firebase service account key  
  - `FIREBASE_DATABASE_URL` = your Realtime Database URL (e.g. `https://...firebasedatabase.app`)
- Deploy and copy your service URL (e.g. `https://your-pose-service.onrender.com`).

### 5. Write the reference to the DB via the service

You need the **module ID** of your lead-jab module (from Firebase Realtime Database → `modules` → the key for that module, e.g. `module_abc123_456`).

**Easiest — use the helper script (Windows/Mac/Linux):**

```bash
python scripts/write_ref_to_db.py reference/punching/ref_lead_jab.json --module-id YOUR_MODULE_ID --service-url https://YOUR-POSE-SERVICE.onrender.com
```

Replace `YOUR_MODULE_ID` and `YOUR-POSE-SERVICE.onrender.com` with your module ID and Render pose-service URL. Success: prints `Reference written to DB`.

**Or with curl + jq (Mac/Linux/WSL):**

```bash
jq --arg id "YOUR_MODULE_ID" '. + {moduleId: $id}' reference/punching/ref_lead_jab.json | curl -s -X POST "https://YOUR-POSE-SERVICE.onrender.com/write-ref" -H "Content-Type: application/json" -d @-
```

- Then in Firebase → **Realtime Database** → `modules` → your module: you should see `referencePoseSequences` and `referencePoseFocus: "punching"`.

### 6. Test in the app

- Run a dev build: `npx expo run:android --device` (pose doesn’t work in Expo Go).
- Open the **lead jab** module → **Try with pose**.
- You should see **Reference: N frames · punching** (or “N examples”). Do a jab; green = match, red = try again.

---

## Steps (Option B — host JSON on Render, then set URL in DB)

1. **Steps 1–3** as above: put videos in `reference/punching/lead-jab/`, install deps, run the extract script to get `ref_lead_jab.json`.
2. **Host the JSON on Render:** Create a **Static Site** on Render, point it at the repo, set **Publish directory** to the folder that contains `ref_lead_jab.json` (e.g. `reference/punching`). After deploy, your JSON URL is e.g. `https://your-static-site.onrender.com/ref_lead_jab.json`.
3. **Set the URL in Firebase:** Realtime Database → `modules` → your lead-jab module → add/edit **referencePoseSequenceUrl** = that full URL.
4. **Test in the app** as in Step 6 above.

More detail for Option B (Render Static Site, Firebase Storage, etc.): **docs/TRAINING_LEAD_JAB_STEPS.md**.

---

## Summary

| Question | Answer |
|----------|--------|
| How many videos? | **5–15** recommended (min 3–5). One sequence per video; app matches to any. |
| Host output on Render? | **Optional.** Option A: no — you POST JSON to pose-service and it writes to DB. Option B: yes — you host the JSON (e.g. Static Site) and set `referencePoseSequenceUrl` in DB. |
| Put ref in DB? | **Yes.** Either the pose-service writes `referencePoseSequences` + `referencePoseFocus` (Option A), or you set `referencePoseSequenceUrl` (Option B). |
| Steps in order | 1) Videos in folder → 2) Run extract script → 3) Deploy pose-service on Render (Option A) or host JSON (Option B) → 4) Write to DB (POST /write-ref or set URL) → 5) Test in app. |

---

## Render: push new changes to deploy

You already have the pose-service on Render. To get the latest code (including the **/write-ref** endpoint):

1. **Push** your repo (e.g. `git add -A && git commit -m "Add /write-ref and training docs" && git push`).
2. If the Render **Web Service** is connected to this repo, it will **auto-deploy** on push. In the Render dashboard → your pose service → **Logs** or **Events** you should see a new deploy.
3. Wait until the deploy status is **Live** (often 1–3 minutes).
4. **Check** that the new endpoint exists: open `https://YOUR-POSE-SERVICE.onrender.com/` in a browser — the JSON should list `"write_ref": "POST /write-ref with ..."`.
5. Then run **Step 5** (write ref to DB) using your Render service URL. If you get 404 or “route not found,” the deploy may still be on the old version; trigger a **Manual Deploy** in Render or re-push.

You don’t need to “host the output” on Render separately — the **Web Service** (pose-service) is what runs your Flask app and now exposes `/write-ref`. Pushing is enough to get that live.

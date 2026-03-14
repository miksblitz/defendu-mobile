# Pose training — one guide

Everything for training a pose reference (e.g. lead jab) and using “Try with pose” in one place.

---

## Reference folder layout

Put all reference videos and extracted JSON in **reference/** — one subfolder per technique:

```
reference/
  punching/         → jabs, hooks, uppercuts (videos + ref_*.json)
  kicking/          → front kick, roundhouse, etc.
  elbow-strike/     → elbow strikes
  defensive-moves/  → blocks, parries, slips
```

Example: lead jab videos go in `reference/punching/lead-jab/`. See **reference/README.md** for more.

**To train the lead jab:** Put 5–15 videos in `reference/punching/lead-jab/`, then run:
`python scripts/extract_reference_pose.py reference/punching/lead-jab -o reference/punching/ref_lead_jab.json --focus punching`
Then follow **Once training is finished** below to send the ref to the app.

---

## How many reference videos?

- **Minimum:** 3–5 different clips (different angles or people).
- **Recommended:** **5–15** clips. More variety (angles, lighting, body types) helps the app accept a range of good reps; the app matches to **any** of the reference sequences.
- We only **extract** pose landmarks (33 per frame) from each video — no neural net training. More references = more acceptable patterns.

Use a **folder** of videos so the script outputs **multiple sequences** (`sequences` in JSON). One sequence per video.

---

## Sideways techniques: use two angles (left + right)

Most modules are performed **sideways** to the camera (profile view), not facing the camera. The phone can end up on the user’s **left** or **right**, so the same jab can be seen from either side.

**In the app:** When publishing a module, trainers can optionally add **Reference video – Side 1** and **Reference video – Side 2** (Step 5). Those videos are uploaded and stored on the module as `referencePoseVideoUrlSide1` and `referencePoseVideoUrlSide2`. Pose extraction (and writing ref to DB) can be run later using those URLs (e.g. via pose-service or scripts).

**Recommendation for trainers:** Send **at least 2 reference videos** for sideways techniques (e.g. jab, cross, hooks):

1. **One with the performer’s left side to the camera** (camera on their left).
2. **One with the performer’s right side to the camera** (camera on their right, so they’re facing the opposite direction).

Both are still sideways to the camera — just mirror views. That way the app has a reference for each orientation and will match the user whether they have the device on their left or right. One rep per clip, same correct technique; only the camera side changes.

---

## Correct poses only, or incorrect too?

**Use only correct poses.** The pipeline doesn’t train a model; it stores “what good looks like.” The app then uses (1) **similarity** to those references and (2) **rule-based checks** (e.g. arm extended, elbow straight) in `lib/pose/jabFeedback.ts` to reject bad form. So reference = correct only; rules handle many incorrect cases. Incorrect videos would only matter if you later add a trained classifier (correct vs incorrect).

**What to focus on:** Only **correct** reps. **Variety** in angles, lighting, body types. **One rep per clip.** Upper body clearly in frame for punching.

---

## Where does the output go? (Render vs DB)

| Option | What you do |
|--------|-------------|
| **A — Write to DB** | Run extract script locally → POST the JSON to your **pose-service on Render** (`/write-ref`) → service writes to Firebase. No hosting the JSON. **Recommended.** |
| **B — Host JSON** | Run extract script → upload JSON to Render Static Site or Firebase Storage → set **referencePoseSequenceUrl** on the module in Firebase. |

---

## Steps (Option A — write to DB)

1. **Put 5–15 videos** in `reference/punching/lead-jab/` (one clean jab per clip). For sideways techniques like jab, include **both** a left-side and a right-side view (see “Sideways techniques” above).

2. **Install deps (one-time):**  
   `pip install opencv-python mediapipe numpy`

3. **Extract pose:**  
   `python scripts/extract_reference_pose.py reference/punching/lead-jab -o reference/punching/ref_lead_jab.json --focus punching`

4. **Deploy pose-service on Render (one-time):** Web Service, build/start per **pose-service/README.md**, env vars `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_DATABASE_URL`.

5. **Write ref to DB:**  
   `python scripts/write_ref_to_db.py reference/punching/ref_lead_jab.json --module-id YOUR_MODULE_ID --service-url https://YOUR-POSE-SERVICE.onrender.com`  
   (Get `YOUR_MODULE_ID` from Firebase Realtime Database → `modules` → your lead-jab module key.)

6. **Test in the app** (see “Run the app” below).

**Option B:** After step 3, upload the JSON to a public URL (e.g. Render Static Site or Firebase Storage), then in Firebase set **referencePoseSequenceUrl** on the module to that URL.

---

## Once training is finished — where do I upload?

You **don’t upload the JSON file** to a website or storage if you use **Option A**.

1. After the extract script runs, you have a file like `reference/punching/ref_lead_jab.json` on your PC.
2. **Get your lead-jab module ID:** Firebase Console → **Realtime Database** → **Data** → expand **modules** → find the module (e.g. “Lead jab” or “Jab test”) and note its **key** (e.g. `module_abc123_456`). That key is the module ID.
3. **Send the ref to the DB:** Run  
   `python scripts/write_ref_to_db.py reference/punching/ref_lead_jab.json --module-id THAT_MODULE_ID --service-url https://YOUR-POSE-SERVICE.onrender.com`  
   That script **POSTs** the JSON to your pose-service on Render; the service **writes** it into Firebase on that module. Nothing to upload manually.
4. **Test:** Open the app (dev build) → that module → **Try with pose**. You should see “Reference: N frames · punching” and get green/red feedback.

If you use **Option B**, you upload the JSON to Firebase Storage or a static host, copy the public URL, and in Realtime Database set **referencePoseSequenceUrl** on the module to that URL.

---

## I have ref_lead_jab.json and videos on either side — what do I do?

**Two separate things:**

| What | Where it lives | What to do |
|------|----------------|------------|
| **2 technique videos** (side 1 + side 2) | Trainer uploads them in Publish Module (steps 2 & 3). Stored as `techniqueVideoUrl`, `techniqueVideoUrl2`, and `referencePoseVideoUrlSide1` / `referencePoseVideoUrlSide2` on the module in Firebase. | Nothing else. They’re already in the DB when the trainer publishes. |
| **Pose reference** (the JSON that makes “Try with pose” work) | Your local file `reference/punching/ref_lead_jab.json` (from running the extract script on your videos). | **Pass it to the DB** using the script below so that module has ref data. |

So: the **videos** are already on the module if the trainer added them. The **ref_lead_jab.json** is what the app uses to match pose — you need to send that JSON into Firebase for the lead-jab module.

**Steps to pass ref_lead_jab.json to the DB (so Render/app can use it):**

1. **Pose-service on Render** must be deployed and live (see pose-service/README.md). You need its URL, e.g. `https://your-pose-service.onrender.com`.

2. **Get the lead-jab module ID:**  
   Firebase Console → your project → **Realtime Database** → **Data** → expand **modules** → find the lead-jab module → copy its **key** (e.g. `module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773319677541`).

3. **From your project folder** (where `reference/punching/ref_lead_jab.json` exists), run:
   ```bash
   python scripts/write_ref_to_db.py reference/punching/ref_lead_jab.json --module-id PASTE_MODULE_ID_HERE --service-url https://YOUR-POSE-SERVICE.onrender.com
   ```
   Replace `PASTE_MODULE_ID_HERE` with the module key and `YOUR-POSE-SERVICE.onrender.com` with your actual Render pose-service URL.

4. If it succeeds, the script prints a success message. The pose-service writes the **heavy** ref data to `referencePoseData/{moduleId}` (not on the module doc) so the dashboard stays fast. The module only gets `referencePoseFocus` and `hasReferencePose`. Open the app → that module → **Try with pose** to test.

**No need to upload ref_lead_jab.json to Render or Vercel.** The script sends it in one POST request to the pose-service; the service writes to Firebase. The app fetches ref from `referencePoseData/{moduleId}` when you open “Try with pose” (or from `referencePoseSequenceUrl` if you use Option B).

**Why this keeps the app fast:** Storing big pose sequences on each module made the modules list slow to load. Now ref data lives under `referencePoseData/{moduleId}` and is loaded only when you open that module’s “Try with pose” step. Redeploy the pose-service after pulling this change so new training runs use the new path. For modules already trained, re-run the write-ref script once per module to move their ref into `referencePoseData` and slim the module doc.

---

## Run the app and test “Try with pose”

- **Pose does NOT work in Expo Go.** Use a dev build:
  ```bash
  cd defendu-mobile
  npx expo run:android --device
  ```
- Open a module → **Try with pose** → allow camera.

---

## How do I know the reference data was fully extracted and loaded?

- **On the “Try with pose” screen**, look at the text under the camera:
  - **“Practice mode (no reference yet)”** → Ref data did not load (module has no ref, or fetch failed). Every rep counts; no green/red. Re-run write-ref for this module and ensure Firebase has `referencePoseData/{moduleId}` (or the module has `referencePoseSequenceUrl`).
  - **“Reference: N frames · punching”** (or “N frames (M examples) · punching”) → Ref data **is** loaded. N = frames in one reference sequence; M = number of reference videos. You should then get **green** when a rep matches and **red** when it doesn’t.

- **In Firebase:** Realtime Database → **referencePoseData** → your `moduleId`. You should see `sequences` (array of pose sequences) and `focus` (e.g. `"punching"`). If it’s missing, run the write-ref script again for that module.

---

## How does rep detection work? When do I see green vs red?

- **For punching:** A rep is counted **on extension only**. When your arm **extends** (wrist moves away from shoulder past a threshold), that’s 1 rep. Retract doesn’t count. You must retract before the next extension counts as another rep (so one full extension = 1, retract, extend again = 2).
- **If you never see green or red:** The rep detector isn’t firing. Do a **clear extension**: punch your arm fully toward the camera. Keep **upper body in frame** and **face the camera**. Each full extension = 1 rep.
- **Green overlay** = rep detected **and** it matched the reference (correct form). Rep count goes up.
- **Red overlay** = rep detected **but** it did **not** match (wrong form or too different from reference). You’ll see “Wrong form” and either “No match — extend arm fully, then retract. Face the camera.” or specific feedback (e.g. “Straighten the punching arm more at extension”). The red flash lasts ~1.2 s so you can read it.

So: the app **does** know when you do a rep (extend then retract). When it does, it compares you to the reference and shows green (correct) or red (wrong).

---

## Tips for getting a correct rep (green)

1. **Face the camera** with your torso—same as the recording rules for technique videos. Don’t stand with your back or full side to the lens.
2. **Upper body in frame** for punching: shoulders, arms, and hips visible. Camera at chest height or so.
3. **One clear jab:** extend your lead arm fully (elbow straight), then retract. Do it at a normal speed; one rep per motion.
4. **Good lighting** so pose landmarks are stable.
5. **If you always get red:** Try “See what a correct rep looks like” (plays the success state). Then mimic that: full extension, then retract. If it still never turns green, the reference may be from a very different angle or body position—re-record reference videos with your body facing the camera and similar distance/framing.

---

## Debugging: "JavaScriptContextHolder.get() on a null object reference"

If you see a red error screen with **`JavaScriptContextHolder.get() on a null object reference`** when opening a module (or when the app loads), it usually means **native code (e.g. pose/MediaPipe) ran before the React Native JS runtime was ready**.

**What we did:** The pose camera screen is **lazy-loaded**: it is only loaded when you tap **"Try with pose"**. Opening a module (intro, video, etc.) no longer loads the pose/MediaPipe native module, so the crash should not happen when just viewing module content.

**If it still happens:**
- Reload the app (shake device → Reload, or press **R, R** in the terminal).
- Use a **dev build** (`npx expo run:android`), not Expo Go, for pose features.
- Ensure you’re not importing or rendering the pose camera anywhere else on the initial screen or dashboard.

---

## Render: push to deploy

Push your repo; if the pose-service Web Service is connected, Render auto-deploys. Wait until **Live**, then open `https://YOUR-POSE-SERVICE.onrender.com/` — you should see `write_ref` listed. Use that URL in step 5 above.

### Render is slow to load (cold start)

On the **free tier**, Render spins down your service after ~15 minutes of no traffic. The **first request** after that can take **30–60+ seconds** (cold start) while the instance starts.

**Options:**

1. **Keep-alive ping** – Use a free cron/uptime tool (e.g. [UptimeRobot](https://uptimerobot.com), [cron-job.org](https://cron-job.org)) to hit your Render URL every **10–14 minutes** (e.g. `GET https://YOUR-POSE-SERVICE.onrender.com/`). That keeps the service warm so the first real request (e.g. write-ref) is fast.
2. **Upgrade** – A paid Render plan keeps the service always-on, so no cold start.
3. **Accept the delay** – If you only run write-ref occasionally, waiting ~1 minute on the first hit may be fine.

---

## Summary

| Question | Answer |
|----------|--------|
| How many videos? | 5–15 recommended (min 3–5). One sequence per video. |
| Correct only? | Yes. Rules handle many “wrong” cases. |
| Output where? | Option A: POST to pose-service → DB. Option B: host JSON → set URL in DB. |
| Steps | Videos in folder → extract script → deploy pose-service (Option A) → write-ref or set URL → test in app (dev build). |

---

## Deleting modules from Realtime Database

If you need to **remove** a module (e.g. old test modules from a previous idea):

**In Firebase Console (manual):**

1. Go to [Firebase Console](https://console.firebase.google.com/) → your project → **Build** → **Realtime Database** → **Data**.
2. Expand **modules**. Find the module you want to delete (use the key, e.g. `module_xyz_123`).
3. **Click the key** (the module ID) so the whole module node is selected.
4. Click the **three dots (⋮)** or **trash** icon next to it → **Delete** (or **Remove**). Confirm.
5. Optionally remove it from the trainer’s list: expand **trainerModules** → your trainer UID → delete the child with that same **moduleId** (so it doesn’t show in the trainer’s “My modules”).

**If the Console won’t let you delete:** Check that you’re signed in as an owner/editor of the project. If the node is large, try deleting in two steps: delete the module’s children first, then delete the module key. If you still can’t, use the script below.

**Script to delete by module ID (run locally):**  
Create a file `scripts/delete_modules.js` (see below). Put your Firebase **service account** key in a file (e.g. `firebase-service-account.json`), then run:  
`node scripts/delete_modules.js module_id_1 module_id_2`  
That deletes those modules from **modules/** and from **trainerModules/<uid>/** for any uid that had them. You need Node and `firebase-admin` installed.

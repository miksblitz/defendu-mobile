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

## Run the app and test “Try with pose”

- **Pose does NOT work in Expo Go.** Use a dev build:
  ```bash
  cd defendu-mobile
  npx expo run:android --device
  ```
- Open a module → **Try with pose** → allow camera.
- **Practice mode (no reference yet)** = no ref data on that module; every rep counts.
- **Reference: N frames · punching** = ref loaded; green = match, red = no match.

**If nothing happens when you move:** Do a **clear motion** (one full jab: arm out then back). Full body in frame for default focus; upper body clearly in frame for punching. Good lighting helps.

---

## Render: push to deploy

Push your repo; if the pose-service Web Service is connected, Render auto-deploys. Wait until **Live**, then open `https://YOUR-POSE-SERVICE.onrender.com/` — you should see `write_ref` listed. Use that URL in step 5 above.

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

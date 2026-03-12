# Getting Pose Estimation Working — Quick Guide

If you're confused about how to make "Try with pose" work, follow this order.

---

## How it’s supposed to work (trainer → student)

- **Trainer:** Only uploads the **technique video** (correct form) when publishing a module. They do **not** see or paste any JSON or URLs.
- **Your backend:** The **pose extraction service** (e.g. on Render) takes that video, runs the same pose AI (MediaPipe) on it, saves the result to Firebase Storage, and sets `referencePoseSequenceUrl` on the module. See **pose-service/README.md** for deploy and env vars.
- **Student:** Opens "Try with pose", does the movement; the app compares their pose to that reference and gives feedback (green = good form, red = try again).

So: **one technique video per module** → the system turns it into the reference data automatically.

---

## 1. Run the app the right way (most common issue)

**Pose estimation does NOT work in Expo Go.** It uses native camera + MediaPipe.

- **Wrong:** Open the app in **Expo Go** (scan QR code) → "Try with pose" will show "Pose detection not available" or fail.
- **Right:** Build and run a **dev build** on a device or emulator:

  ```bash
  cd defendu-mobile
  npx expo run:android
  ```
  For a **physical phone**: connect via USB and run:
  ```bash
  npx expo run:android --device
  ```

Then open a module and tap **"Try with pose"**. Allow camera when prompted.

---

## 2. What “working” looks like

| What you see | Meaning |
|--------------|--------|
| **"Loading pose detection..."** then camera view | Native pose is loading; wait a moment. |
| **"Try with pose"** with camera and hints | Pose is running. Reps are being detected from your movement. |
| **"Practice mode (no reference yet)"** | No reference is set for this module; every detected rep counts. You can still complete the step. |
| **"Reference loaded (punching)"** (or kicking/full) | Reference JSON is loaded; the app will compare your reps to it (green = match, red = no match). |
| **Nothing happens when you move** | Rep detector isn’t firing. See section 4 below. |

---

## 3. Optional: Add a reference so “correct” vs “wrong” is checked

If you want **green** only when the movement matches a reference (e.g. your lead jab video):

1. **Extract** pose from your video (on your PC):
   ```bash
   cd defendu-mobile
   pip install opencv-python mediapipe numpy
   python scripts/extract_reference_pose.py reference/punching/lead-jab -o reference/punching/ref_lead_jab.json --focus punching
   ```
   (Use your video path or folder; `reference/punching/lead-jab` can be a folder of videos.)

2. **Upload** the JSON (e.g. to Firebase Storage) and copy the **public URL**.

3. **Set the URL** on the module in Firebase **Realtime Database** (see “Set the URL in Firebase” below).

4. **In the app:** Open that module → "Try with pose". You should see **"Reference loaded (punching)"**. Do the movement; green = match, red = no match.

### Automatic vs manual

- **Automatic:** Deploy the **pose extraction service** (see **pose-service/README.md**) and set `EXPO_PUBLIC_POSE_EXTRACTION_URL`. When a trainer publishes with a technique video, the service extracts pose and sets the reference.
- **Manual (fallback):** For modules that were published (existing modules), or if the service is not deployed: run scripts/extract_reference_pose.py, upload the JSON, then set the URL in Firebase (below).

### Set the URL in Firebase (Realtime Database) — only for manual fallback

Your app uses **Firebase Realtime Database** (not Firestore). Modules live under the `modules` node. To point a module at your Render URL (e.g. for older modules or when the trainer didn’t add one):

1. Go to **[Firebase Console](https://console.firebase.google.com/)** and open your project.
2. In the left sidebar: **Build → Realtime Database**.
3. Open the **Data** tab. You’ll see the database tree (e.g. `modules`, `users`, …).
4. Expand **modules**. Each child is one module (the key is the `moduleId`).
5. Click the **module** you want “Try with pose” to use (e.g. the lead jab or cross module). If you’re not sure which key is which, check the `moduleTitle` or `description` for that node.
6. In that module’s fields, **add** or **edit**:
   - **Key:** `referencePoseSequenceUrl`
   - **Value:** your **full public URL** to the JSON (e.g. from Render: `https://your-service.onrender.com/ref_lead_jab.json` — use the exact URL that returns the JSON when you open it in a browser).
7. Save (e.g. **Enter** or the checkmark). The app fetches `module.referencePoseSequenceUrl` when the user opens “Try with pose” for that module.

**If you deployed the JSON on Render:** Use the Render service URL + path to the file (e.g. `https://defendu-pose-refs.onrender.com/ref_lead_jab.json`). Ensure the route returns the raw JSON (no HTML wrapper) and that the URL is publicly accessible (no auth). Then paste that URL as the value of `referencePoseSequenceUrl` for the module.

Detailed steps: **docs/TRAINING_LEAD_JAB_STEPS.md** and **scripts/README.md**.

---

## 4. “Nothing happens” when I do the pose (no green, no red)

Reps are detected from **movement**, not from a single static pose.

- **Full body (default):** Hips go **down** then **up** (e.g. squat and stand). The app needs to see your **full body**, especially **hips**.
- **Punching** (if reference has `focus: punching`): **Arm extends** (wrist away from shoulder) then **retracts**. Upper body in frame.
- **Kicking:** Leg goes **up** then **down**. Legs in frame.

**Check:**

1. **Full body in frame** for default/full focus — camera far enough to see hips.
2. **Good lighting** and minimal clutter behind you.
3. **Do a clear motion** (one full squat, or one full jab, or one kick), not tiny movements.
4. If you see **"Rep detected"** in red but never green, the rep is counted but doesn’t match the reference — try moving more like the reference, or loosen the threshold in `lib/pose/comparator.ts` (`DEFAULT_MATCH_THRESHOLD`, try `0.22`–`0.28`).

---

## 5. Checklist

| Step | Action |
|------|--------|
| 1 | Run **`npx expo run:android`** (or `--device` for phone), not Expo Go. |
| 2 | Open a module → tap **"Try with pose"** → allow camera. |
| 3 | Confirm you see the camera and either "Practice mode" or "Reference loaded". |
| 4 | For full-body: do a clear **squat/stand** (hips down then up). For punching: do a clear **jab** (arm out then back). |
| 5 | (Optional) Add reference: extract JSON → upload → set `referencePoseSequenceUrl` on the module. |

---

## 6. More detail

- **How it’s implemented:** **docs/POSE_ESTIMATION_IMPLEMENTATION.md**
- **Training a jab (reference + Firebase):** **docs/TRAINING_POSE_JABS.md**
- **Lead jab end-to-end:** **docs/TRAINING_LEAD_JAB_STEPS.md**
- **Scripts (extract, focus, dataset):** **scripts/README.md**

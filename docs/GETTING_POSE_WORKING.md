# Getting Pose Estimation Working — Quick Guide

If you're confused about how to make "Try with pose" work, follow this order.

---

## How it’s supposed to work (per-module training)

- **Trainer** publishes a module (with technique video, etc.). The app **does not** auto-generate pose reference on publish.
- **Training pipeline** (separate): uses **reference videos** (e.g. from `reference/punching/`, `reference/kicking/`) + trainer’s video, runs **1–2 days**, requires **payment**. Produces a **module-specific** pose reference (one module = one move evaluator: jab, hook, block, etc.). Writes `referencePoseSequence` / URL and `referencePoseFocus` to the module in Firebase.
- **Student:** Opens "Try with pose". If the module has reference data → app compares reps to it (green / red). If not → **practice mode** (reps counted, no correct/incorrect).

See **docs/POSE_TRAINING_MODULES.md** for the full architecture (shared pose layer + per-module evaluators).

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
| **"Practice mode (no reference yet)"** | No reference is set for this module (training not done yet); every detected rep counts. You can still complete the step. |
| **"Reference: N frames · punching"** (or kicking/full) | Pose reference is loaded (from training pipeline); the app compares your reps to it (green = match, red = no match). |
| **Nothing happens when you move** | Rep detector isn’t firing. See section 4 below. |

---

## 3. Adding a reference (manual / testing)

Reference data is normally set by the **training pipeline** (reference videos + payment, 1–2 days). For **testing or manual setup** you can:

1. **Extract** pose from a video (on your PC):
   ```bash
   cd defendu-mobile
   pip install opencv-python mediapipe numpy
   python scripts/extract_reference_pose.py reference/punching/lead-jab -o reference/punching/ref_lead_jab.json --focus punching
   ```
   (Use your video path or folder; `reference/punching/lead-jab` can be a folder of videos.)

2. **Upload** the JSON (e.g. to Firebase Storage or a public URL) and copy the URL.

3. **Set the URL** on the module in Firebase **Realtime Database**: under `modules/<moduleId>` add or edit **referencePoseSequenceUrl** with that URL.

4. **In the app:** Open that module → "Try with pose". You should see reference loaded. Do the movement; green = match, red = no match.

Alternatively, write **referencePoseSequence** (or **referencePoseSequences**) and **referencePoseFocus** directly on the module in the DB (same format the training pipeline would write).

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
4. If you see **"Rep detected"** in red but never green, the rep is counted but doesn’t match the reference — try moving more like the reference, or tune the threshold in `lib/pose/comparator.ts` (e.g. `PUNCHING_MATCH_THRESHOLD`).

---

## 5. Checklist

| Step | Action |
|------|--------|
| 1 | Run **`npx expo run:android`** (or `--device` for phone), not Expo Go. |
| 2 | Open a module → tap **"Try with pose"** → allow camera. |
| 3 | Confirm you see the camera and either "Practice mode" or "Reference loaded". |
| 4 | For full-body: do a clear **squat/stand** (hips down then up). For punching: do a clear **jab** (arm out then back). |
| 5 | (Optional) Add reference manually: extract JSON → upload → set `referencePoseSequenceUrl` on the module; or use the training pipeline. |

---

## 6. More detail

- **Train lead jab (video count, Render vs DB, step-by-step):** **docs/TRAINING_LEAD_JAB_QUICKSTART.md**
- **Per-module training (reference videos, payment, 1–2 days):** **docs/POSE_TRAINING_MODULES.md**
- **Reference folder (reference videos per technique):** **reference/README.md**
- **How it’s implemented:** **docs/POSE_ESTIMATION_IMPLEMENTATION.md**
- **Training a jab (reference + Firebase):** **docs/TRAINING_POSE_JABS.md**
- **Lead jab (host JSON + set URL):** **docs/TRAINING_LEAD_JAB_STEPS.md**

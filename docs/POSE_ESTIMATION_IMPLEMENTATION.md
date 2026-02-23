# Pose Estimation Feature — Implementation Guide

This guide describes how to add **pose-based technique feedback** to modules: use a **reference (correct technique) video** as the source of truth, **MediaPipe (or TF.js) for pose estimation**, and **TensorFlow / similarity logic** to compare the user’s live movement. The user uses the **front camera** at a distance so the **whole body** is visible; a rep only counts when the movement matches the reference, and the flow **only proceeds after a required number of correct reps** (from `repRange`).

---

## 1. High-level flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ REFERENCE (per module)                                                       │
│ techniqueVideoUrl → Extract pose sequence (landmarks per frame)              │
│                  → Store as "reference pose sequence" (e.g. Firebase/JSON)  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ USER SESSION (Try with pose)                                                 │
│ Front camera → Pose estimation (MediaPipe / TF.js) → Landmarks per frame    │
│             → Compare current rep segment to reference (TF or DTW in JS)    │
│             → If similarity above threshold → rep counts, UI turns green     │
│             → After N correct reps → allow "Next" / complete step           │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Green** = current rep matches reference (counts toward required reps).
- **Not green** = rep doesn’t match; user must repeat until N correct reps are done.

---

## 2. Where it fits in your app

- **Module model**: Already has `techniqueVideoUrl` (and optionally `techniqueVideoLink`) and `repRange` (e.g. `"4-6 reps"`, `"8-10 reps"`).
- **ViewModuleScreen**: Current steps are `intro` → `video` → `tryIt` → `complete`. You will add either:
  - A **new step** `tryItPose` (e.g. “Try with pose”), or  
  - A **mode** inside `tryIt`: “Timer only” vs “Pose check” (when `techniqueVideoUrl` exists).

Recommended: add a **“Try with pose”** option that appears when the module has a technique video. When chosen, show camera, run pose comparison, and only allow completion after **required correct reps** (parsed from `repRange`).

---

## 3. Dependencies to add

Install in `defendu-mobile`:

```bash
# Camera (Expo)
npx expo install expo-camera

# Pose detection options (choose one path):

# Option A — TensorFlow.js + pose-detection (works on Expo with tfjs-react-native)
npm install @tensorflow/tfjs @tensorflow/tfjs-react-native @tensorflow-models/pose-detection
# Optional: react-native-fs for loading models from bundle
# Note: tfjs-react-native has native deps; you may need a dev build (expo prebuild) for full body.

# Option B — React Native MediaPipe wrapper (if you prefer MediaPipe on device)
# e.g. a package like @gymbrosinc/react-native-mediapipe-pose (evaluate stability for production)
# Often requires Expo dev client / prebuild.
```

- **expo-camera**: Front camera, full-body framing, and frame callbacks for pose.
- **Pose on device**: Either **TF.js pose-detection** (MoveNet/BlazePose) or a **MediaPipe Pose** React Native wrapper. Both give 17–33 landmarks per frame.
- **Comparison**: Can be implemented in **TensorFlow.js** (e.g. small similarity model or embedding) or in **plain JavaScript** (normalize landmarks + DTW or frame-wise distance). No extra TF dependency is strictly required for comparison if you use simple distance/DTW.

Permissions:

- In `app.json` (or `app.config.js`): ensure camera permission and usage description for iOS/Android.

### 3.1 How to do this (step-by-step)

**1. Camera (already done)**  
You already ran `npx expo install expo-camera`. Keep it.

**2. Camera permissions in `app.json`**  
Add the Expo camera plugin and the iOS usage description so the system prompts for camera access:

- In the `expo` object, find `"plugins"`. Add `"expo-camera"` to the array:
  ```json
  "plugins": [
    ["expo-build-properties", { "android": { "usesCleartextTraffic": true } }],
    "expo-camera"
  ]
  ```
- Under `expo.ios.infoPlist`, add the camera usage description (required for App Store):
  ```json
  "NSCameraUsageDescription": "This app uses the camera for pose-based technique feedback during exercises."
  ```
  So `infoPlist` looks like:
  ```json
  "infoPlist": {
    "NSAppTransportSecurity": { "NSAllowsArbitraryLoads": true },
    "NSCameraUsageDescription": "This app uses the camera for pose-based technique feedback during exercises."
  }
  ```
  Android camera permission is added automatically by the `expo-camera` plugin.

**3. Choose pose detection (one of the two)**

- **Option A — TensorFlow.js (recommended to start)**  
  - Run:
    ```bash
    npm install @tensorflow/tfjs @tensorflow/tfjs-react-native @tensorflow-models/pose-detection
    ```
  - Use `expo-camera` to get frames, then run the TF.js pose-detection model (e.g. MoveNet or BlazePose) on each frame to get 17–33 landmarks.
  - For a **development build** (native code), run `npx expo prebuild` and then build; the managed workflow may not include all native bits for `tfjs-react-native`.

- **Option B — MediaPipe Pose on device**  
  - Install a React Native wrapper, e.g. `@gymbrosinc/react-native-mediapipe-pose` (check npm for current name and stability).
  - These packages usually require a **custom / dev build** (`npx expo prebuild` and build with EAS or locally), not Expo Go.
  - Use the package’s API to get pose landmarks from the same camera frames you get via `expo-camera` (or the wrapper’s own camera if it provides one).

**4. Comparison (no extra TF needed)**  
Use **plain JavaScript** first:

- Normalize landmarks (center on hip/shoulder, scale by body size).
- Compare the user’s rep (sequence of frames) to the reference with **frame-by-frame distance** or a small **DTW** library (e.g. `dtw` on npm).
- If (normalized) distance &lt; threshold → rep is correct (green); otherwise don’t count it and don’t turn green.

### 3.2 MoveNet vs BlazePose vs MediaPipe — which to use?

For **technique feedback** (comparing user movement to a reference), you want the best tradeoff between **accuracy**, **full-body stability**, and **mobile performance**. Recommendation:

| Option | Keypoints | Accuracy / stability | Speed (mobile) | Integration (Expo/RN) |
|--------|-----------|----------------------|----------------|------------------------|
| **MoveNet** | 17 | Good for rep counting; less detail for fine form | Fast, lightweight | TF.js: works with `@tensorflow-models/pose-detection`; may need dev build for `tfjs-react-native`. |
| **BlazePose** | 33 | **Best for technique** — more joints (wrists, ankles, etc.), better for angles and form | Heavier than MoveNet but still real-time | TF.js: same package, choose `PoseDetection.BlazePose` model. |
| **MediaPipe Pose** | 33 | Same as BlazePose (uses BlazePose under the hood) | **Fastest** when using native SDK | RN wrapper (e.g. `@gymbrosinc/react-native-mediapipe-pose`) usually requires **dev build** (Expo prebuild), not Expo Go. |

**Best for this app: BlazePose (or MediaPipe if you can use a dev build).**

- **Technique matters**: You’re judging “correct” vs “wrong” movement. **BlazePose** (33 landmarks) gives you elbows, wrists, knees, ankles, and torso in more detail than MoveNet (17), so your comparison (normalize + DTW or frame distance) can better capture form.
- **Same pipeline**: Reference video and live camera should use the **same** model (e.g. both BlazePose, or both MediaPipe) so landmark indices and semantics match. If the backend uses MediaPipe for the technique video, use BlazePose or MediaPipe on device; if the backend uses TF.js BlazePose, use BlazePose on device.
- **Practical choice**:
  - **TF.js path (Expo, minimal native)**: Use **BlazePose** from `@tensorflow-models/pose-detection` (e.g. `createDetector(poseDetection.SupportedModels.BlazePose, ...)`). Slightly heavier than MoveNet but much better for technique.
  - **Native path (dev build ok)**: Use **MediaPipe Pose** via a React Native wrapper for best speed and the same 33-landmark quality.

Use **MoveNet** only if you need the lightest option (e.g. very low-end devices or Expo Go without prebuild) and can accept coarser technique feedback.

---

## 4. Reference pipeline: technique video → pose sequence

The **source of data** for “correct technique” is the module’s **technique video** (`techniqueVideoUrl`).

### 4.1 Where to run it

- **Backend (recommended for v1)**: A Cloud Function or a small Node script that:
  - Downloads or streams the technique video.
  - Runs **MediaPipe Pose** or **TF.js pose-detection** (e.g. in Node with `@mediapipe/tasks-vision` or headless Chrome) to get landmarks per frame.
  - Outputs a **reference pose sequence**: array of frames, each frame = array of `{x, y, z?, visibility?}` (or similar) for each landmark.
- **On device**: Possible but heavy (decode video + run pose on every frame). Better as a later optimization.

### 4.2 Output format (reference pose sequence)

Store something like:

```ts
// types/pose.ts
export type PoseLandmark = { x: number; y: number; z?: number; visibility?: number };
export type PoseFrame = PoseLandmark[];  // 33 for MediaPipe, 17 for MoveNet
export type PoseSequence = PoseFrame[];  // one per frame (or subsampled, e.g. 10 fps)
```

- Normalize **time**: e.g. one “rep” = segment from start to end of one repetition in the reference (you can trim manually or detect cycles).
- Store **one representative rep** (or one full sequence with rep boundaries) per module, keyed by `moduleId`.

### 4.3 Where to store

- **Firebase**: e.g. `modules/{moduleId}/referencePoseSequence` (or a separate collection).
- Or **Cloud Storage**: JSON file per module, URL in Firestore (e.g. `referencePoseSequenceUrl` on the module document).

---

## 5. Comparison algorithm (TensorFlow / similarity)

Goal: decide if the **user’s current rep** (sequence of pose frames) is “close enough” to the **reference rep**.

### 5.1 Normalization (important)

- **Translation**: Subtract a center point (e.g. hip midpoint or shoulder center) so both user and reference are centered.
- **Scale**: Normalize by body size (e.g. torso length or shoulder–hip distance) so different distances from camera and body sizes don’t dominate the score.
- **Orientation** (optional): If user faces the camera and reference is also frontal, you may only need to flip horizontal; if reference is side view, you might need a separate “reference view” or skip orientation alignment for v1.

### 5.2 Comparison options

1. **DTW (Dynamic Time Warping)** in JS  
   - Compare two sequences of vectors (each vector = normalized landmarks for one frame).  
   - Use a small library (e.g. `dtw` on npm) or implement simple DTW on landmark vectors.  
   - Threshold: if normalized DTW distance < threshold → rep is “correct” (green).

2. **TensorFlow.js**  
   - Encode each frame (or whole rep) into an embedding with a tiny model; compare reference vs user embedding (e.g. cosine similarity).  
   - More flexible but more work; use if you need to support many different exercises with one model.

3. **Frame-by-frame similarity**  
   - Align reference and user rep length (e.g. interpolate or subsample to same number of frames).  
   - Sum (or average) per-frame landmark distance (after normalization).  
   - Threshold on mean distance → correct or not.

Recommendation for first version: **normalize landmarks + frame-by-frame or DTW in plain JS**; add TensorFlow.js for comparison only if you later want learned embeddings.

---

## 6. Parsing required reps from `repRange`

Modules already have `repRange` (e.g. `"4-6 reps"`, `"8-10 reps"`, `"12 reps"`). Use the **upper bound** (or middle) as the required number of **correct** reps before proceeding:

```ts
// utils/repRange.ts
export function getRequiredReps(repRange: string | undefined): number {
  if (!repRange?.trim()) return 5; // default
  const match = repRange.match(/(\d+)\s*-\s*(\d+)|(\d+)/);
  if (!match) return 5;
  const a = match[1] ? parseInt(match[1], 10) : null;
  const b = match[2] ? parseInt(match[2], 10) : null;
  const c = match[3] ? parseInt(match[3], 10) : null;
  if (a != null && b != null) return Math.max(a, b); // e.g. 4-6 → 6
  if (c != null) return c;
  return 5;
}
```

Use this when entering the “Try with pose” flow: “Complete 6 correct reps to continue” (or whatever number you choose from `repRange`).

---

## 7. UI flow in ViewModuleScreen

### 7.1 When to show “Try with pose”

- If `module.techniqueVideoUrl` (or `techniqueVideoLink`) exists **and** you have a stored reference pose sequence for this module (or you’re okay loading it on demand), show a button like **“Try with pose”** in addition to (or instead of) the simple “Try it yourself” timer.

### 7.2 New step or screen: `tryItPose`

- **Layout**: Full-screen (or large) camera view so the user can place the phone at a distance and get **full body** in frame.
- **Camera**: Use **front camera** (`facing: 'front'`), and show a short hint: “Position your device so your full body is visible.”
- **Overlay**:
  - Required reps: e.g. “Correct reps: 3 / 6”.
  - Current rep state: **green** when the last completed rep was correct, **not green** when incorrect or in progress.
  - Optional: simple skeleton overlay from pose landmarks so the user sees they’re detected.
- **Logic**:
  - Start pose estimation on each camera frame.
  - Detect **rep boundaries** (e.g. from pose heuristics: squat down → up = one rep; or from a “Rep” button for v1).
  - When one rep is complete, run the **comparison** (user segment vs reference). If similarity above threshold → increment correct rep count and show green; else don’t count and don’t turn green.
  - When `correctReps >= requiredReps`, enable **“Next”** or **“Continue”** to move to the next step (e.g. back to “Complete” or next exercise).

### 7.3 Only proceed after N correct reps

- **Do not** advance to “Complete” or “Next” until `correctReps >= getRequiredReps(module.repRange)`.
- You can still allow a “Skip” or “Finish without pose” for accessibility, but the primary path is: N correct reps → then proceed.

---

## 8. Suggested file structure

```
defendu-mobile/
├── docs/
│   └── POSE_ESTIMATION_IMPLEMENTATION.md   (this file)
├── lib/
│   ├── models/
│   │   └── Module.ts                       (already has techniqueVideoUrl, repRange)
│   ├── pose/
│   │   ├── types.ts                        (PoseLandmark, PoseFrame, PoseSequence)
│   │   ├── normalizer.ts                   (center, scale, optional flip)
│   │   ├── comparator.ts                   (DTW or frame-wise similarity)
│   │   ├── repDetector.ts                  (optional: detect rep start/end from pose)
│   │   └── usePoseDetection.ts             (hook: camera frames → landmarks)
│   └── ...
├── screens/
│   └── ViewModuleScreen.tsx                (add tryItPose step, camera + rep counter)
├── components/
│   └── PoseCameraView.tsx                  (camera + overlay: rep count, green/red)
└── utils/
    └── repRange.ts                         (getRequiredReps)
```

Backend (if you add it):

- `functions/` or `scripts/`: script or Cloud Function that fetches `techniqueVideoUrl`, runs pose extraction, and writes reference sequence to Firebase/Storage.

---

## 9. Implementation order

1. **Types and rep count**  
   Add `PoseLandmark`, `PoseFrame`, `PoseSequence` and `getRequiredReps(repRange)`. Optionally add `referencePoseSequenceUrl?: string` (or similar) to the Module type if you store reference in Storage.

2. **Camera + pose on device**  
   Add `expo-camera` and one pose stack (TF.js pose-detection or MediaPipe RN). Implement `usePoseDetection` that returns landmarks for each frame. Verify full-body detection with front camera at distance.

3. **Reference pipeline**  
   Build a script or backend job: input `techniqueVideoUrl` → pose extraction → save reference sequence. Expose it per module (Firebase or URL).

4. **Normalizer + comparator**  
   Implement `normalizer.ts` and `comparator.ts`; test with two sample sequences (e.g. from two videos) and tune threshold so “correct” vs “wrong” feels right.

5. **Rep detection**  
   Either simple (user taps “Rep” when they finish one) or heuristic (e.g. knee angle / hip height over time). Use rep boundaries to slice user sequence and compare one rep at a time.

6. **UI**  
   Add `PoseCameraView` and the `tryItPose` step in `ViewModuleScreen`: show camera, required reps, green only when rep is correct, enable “Next” only after N correct reps.

7. **Integration**  
   Wire “Try with pose” to load reference sequence for the current module; handle missing reference (fallback to timer-only “Try it yourself”).

---

## 10. Short summary

| Piece | Role |
|-------|------|
| **Source of data** | Module’s `techniqueVideoUrl` (correct technique video). |
| **MediaPipe / TF** | Pose estimation: reference video → pose sequence; live camera → pose per frame. |
| **TensorFlow (algorithm)** | Comparison: normalize landmarks, then DTW or frame-wise similarity (TF.js optional). |
| **Front camera** | User flow; device at distance so full body is in frame. |
| **Green / proceed** | Green only when current rep matches reference; proceed only after N correct reps (from `repRange`). |

This gives you a clear path from “reference video + live camera” to “correct reps only, then next step,” using MediaPipe (or TF.js) for pose and TensorFlow or plain JS for the comparison algorithm.

---

## 11. Run to train (MediaPipe implementation — Android)

The app uses **@thinksys/react-native-mediapipe** for pose detection on **Android** (and iOS).

**To run on device (required for camera/pose):**

1. **Prebuild** (native code): run `npx expo prebuild`, then run on a **physical Android device**: `npx expo run:android --device`.
2. **Android**: Camera permission is requested at runtime; the ThinkSys package and expo-camera plugin configure the manifest. Ensure your device has camera access allowed for the app.
3. **Practice mode**: If a module has no `referencePoseSequenceUrl`, "Try with pose" still works: every tap on **Rep** counts as a correct rep so you can complete the required reps and proceed. Once you add reference JSON per module, comparison runs and only matching reps turn green and count.
4. **Reference JSON format**: Store one rep of pose frames as either a raw array of frames or `{ "sequence": [ ... ] }`. Each frame is an array of 33 landmarks `{ x, y, z?, visibility? }`. Host the JSON and set `referencePoseSequenceUrl` on the module in Firebase.

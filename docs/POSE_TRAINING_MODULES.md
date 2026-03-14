# Pose estimation: per-module training (reference videos + payment)

Pose-based “Try with pose” uses a **per-module** approach: one module = one move evaluator. Reference data is **not** generated automatically when a trainer uploads a module. It is produced by a **training pipeline** that uses many reference videos and takes 1–2 days, with payment.

## Architecture

### Shared layer (reused for all modules)

- **MediaPipe Pose** — extracts 33 landmarks per frame (same on device and in training).
- **Pose types, normalizer, focus** — `lib/pose/types.ts`, `normalizer.ts`, `poseFocus.ts`.
- **Rep detection** — `repDetector.ts` (guard → extension → impact → recoil for punching; similar for other moves).
- **Frame alignment / timing** — in comparator and phase detection.

### Move-specific layer (one evaluator per module type)

- **Jab module** → jab-specific scoring (extension, elbow, guard at impact). See `lib/pose/jabFeedback.ts`, `phaseDetection.ts`.
- **Hook, uppercut, block, kick**, etc. → each has or will have its own evaluator (same landmarks, different rules).

So: you reuse the core pose system; each module has its own judging logic.

## Flow

1. **Trainer** publishes a module (title, description, technique video, category, etc.). The app **does not** run any pose extraction on publish.
2. **Training pipeline** (outside the app):  
   - Input: **reference videos** (e.g. from `reference/punching/`, `reference/kicking/`, etc.) **plus** the trainer’s technique video.  
   - Process: train / build a **module-specific** pose reference or evaluator (1–2 days).  
   - Payment required for this step.  
   - Output: writes **reference pose data** to the module in Firebase (e.g. `referencePoseSequence` or `referencePoseSequenceUrl`, `referencePoseFocus`).
3. **App**: When a module has reference pose data, “Try with pose” loads it and uses the **appropriate evaluator** for that module type (e.g. punching → jab/hook logic). If the module has no reference data yet, “Try with pose” runs in **practice mode** (reps counted, no correct/incorrect vs reference).

## Reference folder

See **reference/README.md**. Folders like `reference/punching/`, `reference/kicking/` hold reference videos (and optionally JSON from `scripts/extract_reference_pose.py`) for use in the training pipeline. The script is for **local extraction** or for preparing inputs to training; it does not run automatically on publish.

## What was removed

- **Automatic pose extraction on publish** — no call to a pose service when a trainer submits a module.
- **“Generate pose reference from video”** in the app — no in-app trigger to extract pose from the technique video.
- **EXPO_PUBLIC_POSE_EXTRACTION_URL** — app no longer calls an extraction service; training is a separate pipeline.

The **pose-service** (Render) and **scripts/extract_reference_pose.py** can still be used by admins or by the training pipeline to extract pose from videos; the app simply no longer invokes them on publish.

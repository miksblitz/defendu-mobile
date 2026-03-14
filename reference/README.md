# Reference folder — per-module pose training

One folder per technique. Put **reference videos** and (optionally) extracted pose JSON here. Used for **training a module-specific pose evaluator**, not for automatic extraction on publish.

## Structure

```
reference/
  punching/         → jabs, hooks, uppercuts, cross, uppercut. Videos + ref_*.json
  kicking/           → front-kick, roundhouse, side-kick, etc.
  elbow-strike/      → horizontal, diagonal, spear, etc.
  knee-strike/       → straight, diagonal, flying-knee, etc.
  defensive-moves/   → block, parry, slip, roll, counter
```

## Intended flow (per-module algorithm)

1. **Trainer** uploads a module with a technique video (and can provide extra reference videos).
2. **Training pipeline** (separate from the app): uses **many reference videos** (from this folder + trainer’s video), runs for **1–2 days**, requires **payment**. Produces a **module-specific** pose reference / evaluator (e.g. jab module → jab evaluator, hook module → hook evaluator).
3. **Output**: the pipeline sets `referencePoseSequence` (or URL) and `referencePoseFocus` on the module in the DB. The app’s **shared pose layer** (MediaPipe, normalization, rep detection) stays the same; the **scoring algorithm is per move** (jab evaluator, hook evaluator, etc.).
4. **Student** opens “Try with pose” only when the module has that trained reference.

So: **one module = one move evaluator**. Reference data is not generated automatically on publish; it comes from the training pipeline after reference videos and payment.

## Local extraction (optional)

To extract pose JSON from a single video (e.g. for testing or for feeding into the training pipeline):

```bash
# From defendu-mobile
pip install opencv-python mediapipe numpy

python scripts/extract_reference_pose.py reference/punching/lead-jab/your_video.MOV -o reference/punching/ref_lead_jab.json --focus punching
```

- Use a **folder** of videos to get a **dataset** (multiple sequences):  
  `python scripts/extract_reference_pose.py reference/punching/lead-jab/ -o reference/punching/ref_lead_jab.json --focus punching`
- Videos (`.mp4`, `.MOV`, etc.) in `reference/` are in `.gitignore`; JSON files can be committed if you want.

**Full steps (video count, Render vs DB, write-ref, test in app):** See **docs/TRAINING_POSE.md**.

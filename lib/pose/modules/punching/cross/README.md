# Cross jab – punching pose logic

Cross jab = **right hand punches**, **left hand in guard**. Mirror of lead/orthodox jab.

## Files

| File | Purpose |
|------|--------|
| **crossJabRepDetector.ts** | Rep detection: right (MediaPipe right) extends, left (MediaPipe left) in guard; retract→extend required. |
| **crossJabFeedback.ts** | Form rules: require leadArm 1 (right punch), left in guard. `getJabFeedbackCross`, `isImpactFormAcceptableCross`. |
| **crossJabComparator.ts** | `compareRepWithFeedbackCross`, `compareRepWithFeedbackAnyCross` (distance + cross form). |
| **index.ts** | Exports `crossJabPipeline` and cross jab helpers. |

## Usage

- **Cross Jab Test** module uses `crossJabPipeline` (registered as `punching/cross-jab-tester`).
- Optional: train reference from CSV into Firebase and use same pipeline for reference-based matching.

## Dependencies

- `../jab/jabFeedback` – `getJabFeedback`, `computeJabMetrics`
- `../../../comparator` – `compareRepsWithFocus`, `PUNCHING_MATCH_THRESHOLD`
- `../../../phaseDetection` – `armExtensionDistances`, `detectJabPhases`

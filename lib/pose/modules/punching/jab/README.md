# Jab – punching pose logic

Jab-related code for punching modules: rep detection, form feedback, and orthodox comparison.

## Files

| File | Purpose |
|------|--------|
| **jabFeedback.ts** | Form rules, metrics (elbow angle, extension, guard), orthodox checks (left punch / right guard). Exports `leadArm`, `getJabFeedback`, `isImpactFormAcceptable`, `getJabFeedbackOrthodox`, `isImpactFormAcceptableOrthodox`. |
| **jabRepDetector.ts** | Rep detection for jabs: `createLeadJabRepDetector` (pose hold), `createOrthodoxJabRepDetector` (left extends, right guard, motion required). |
| **jabComparator.ts** | Orthodox compare: `compareRepWithFeedbackOrthodox`, `compareRepWithFeedbackAnyOrthodox` (distance + orthodox form). |
| **index.ts** | Re-exports everything above for `import { ... } from '../jab'` or `from '.../punching/jab'`. |

## Usage

- **Orthodox jab pipeline** (`orthodox-jab/index.ts`) and **Lead jab** (`lead-jab-test-defendu/index.ts`) import from `../jab`.
- Root pose code re-exports for backward compatibility: `lib/pose/jabFeedback.ts` and `lib/pose/repDetector.ts` re-export from here.

## Dependencies

- `../../../types` – PoseFrame, JabPhase, etc.
- `../../../phaseDetection` – armExtensionDistances, detectJabPhases
- `../../../comparator` – compareRepsWithFocus, PUNCHING_MATCH_THRESHOLD (jabComparator only)

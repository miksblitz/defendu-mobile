# Pose phases and rule-based feedback (jab / striking)

This doc answers: **Is the system doing full motion comparison and live feedback?** and describes what’s implemented and how to use it.

---

## 1. What the system did before (and still does)

| Step | Before | Now |
|------|--------|-----|
| **Trainer/reference** | Extract pose frame-by-frame from a clean video; save landmark sequence. | Same. **Phase detection** added: we can identify guard, extension, impact, recoil in a reference or user sequence. |
| **Comparison** | Normalize (body size, camera distance), then **whole-sequence** frame-by-frame L2 distance. Resample user to reference length. | Same. **Plus** rule-based jab feedback when the rep **doesn’t** match (punching focus). |
| **Live feedback** | After each rep: green = match, red = “No match — try again”. | **Plus** specific messages when red, e.g. “Front hand not fully extended”, “Rear hand dropped from guard”, “Feet too close together”, “Rotate shoulder more”, “Keep head balanced over hips”. |

So: **full motion** (sequence) comparison was already there; **phases** and **actionable feedback** are now in place for jabs/striking.

---

## 2. “Final form” only vs full motion

- The app has **never** compared only the last frame. It compares the **whole rep** (sequence of frames), normalized and resampled to the reference length.
- For self-defense moves (jab, cross, etc.) that’s the right approach: the path of the movement matters, not just the end pose.
- **Phase detection** (guard → extension → impact → recoil) is used to:
  - Pick an “impact” window for rule-based metrics (elbow angle, extension, guard, etc.).
  - Allow future phase-by-phase comparison or scoring (e.g. “extension phase: 7/10”).

---

## 3. What’s implemented now

### 3.1 Trainer/reference processing

- **Pose extraction**: `scripts/extract_reference_pose.py` runs MediaPipe frame-by-frame on a trainer video and saves landmark sequences (single rep or dataset).
- **Phases**: `lib/pose/phaseDetection.ts` can take a sequence and detect:
  - **guard** (start until arm begins to extend),
  - **extension** (arm going out),
  - **impact** (window around max extension),
  - **recoil** (arm returning).
- Phase bounds are derived from wrist–shoulder distance over time (which arm extends more = punching arm). No change to the extraction script is required; phases are computed at runtime from the saved sequence.

### 3.2 Comparison logic

- **Sequence comparison** (unchanged): normalize (center on mid-hip, scale by body size), resample user to reference length, mean L2 distance. Below threshold → correct rep.
- **Normalization**: Body size and camera distance are already normalized in `lib/pose/normalizer.ts`.
- **Rule-based jab feedback** (new), in `lib/pose/jabFeedback.ts`:
  - **Elbow angle** (punching arm) — e.g. “Straighten the punching arm more at extension”.
  - **Wrist relative to shoulder** — “Front hand not fully extended”.
  - **Chin/guard** — “Rear hand dropped from guard”.
  - **Stance width** — “Feet too close together”.
  - **Shoulder rotation** — “Rotate shoulder more into the punch”.
  - **Head balance** — “Keep head balanced over hips”.
- Rules can use either:
  - **Reference**: compare user metrics to reference at impact, or
  - **Fixed thresholds** (no reference): e.g. min extension, max rear-hand drop, min stance width.
- When a rep **fails** the sequence threshold and focus is **punching**, the comparator returns these feedback items; **PoseCameraView** shows up to 4 of them on the red “Rep detected” overlay.

### 3.3 Live user feedback

- Pose runs on the camera stream; reps are detected (e.g. arm extend → retract for punching).
- **After each rep**:
  - If match: green, “Correct rep!”.
  - If no match and punching: red + **specific feedback** (e.g. “Front hand not fully extended”, “Rear hand dropped from guard”).
  - If no match and not punching: red + “No match — try again or get closer to reference”.
- Feedback is **per rep** (after the rep is done), not yet per-frame live hints. Adding a live “current phase + hints” overlay is possible by reusing the same rules on the latest frame.

---

## 4. Pure rule-based MVP (no reference)

You can get useful feedback **without** a reference video:

- In `lib/pose/jabFeedback.ts`, `compareJabMetrics(user, null)` uses fixed rules only:
  - Elbow angle at impact &gt; ~155°,
  - Extension above a minimum,
  - Rear hand not dropped too far,
  - Stance width above a minimum,
  - Head not leaning too far.
- So even in “practice mode” (no `referencePoseSequenceUrl`), you could call the jab feedback with `referenceFrames = null` and show hints. Right now, practice mode counts every rep as correct and does not show the red overlay; if you want rule-only hints in practice mode, you’d add a branch that runs `getJabFeedback(userFrames, null)` and shows the list without requiring a reference.

---

## 5. How to use it

1. **Reference**: Use a clean jab (or strike) video; run `extract_reference_pose.py` with `--focus punching`; upload JSON and set `referencePoseSequenceUrl` on the module (see `scripts/README.md`).
2. **Module**: Ensure the module uses `poseFocus: 'punching'` (or the reference JSON has `"focus": "punching"`) so the app uses punching rep detection and rule-based feedback.
3. **Try with pose**: Open “Try with pose” for that module. When a rep doesn’t match, the red overlay will show up to 4 specific messages (e.g. “Front hand not fully extended”, “Rear hand dropped from guard”) when available.

---

## 6. File reference

| File | Role |
|------|------|
| `lib/pose/types.ts` | `JabPhase`, `PhaseBounds`, `PoseFeedbackItem`, `RuleBasedFeedbackResult`. |
| `lib/pose/phaseDetection.ts` | `detectJabPhases()`, `armExtensionDistances()`, `getPhaseFrame()`. |
| `lib/pose/jabFeedback.ts` | `computeJabMetrics()`, `compareJabMetrics()`, `getJabFeedback()`. |
| `lib/pose/comparator.ts` | `compareRepWithFeedback()`, `compareRepWithFeedbackAny()` (match + feedback). |
| `components/PoseCameraView.tsx` | Uses comparator feedback; shows `lastFeedback` on wrong overlay. |

---

## 7. Optional next steps

- **Phase-aligned comparison**: Compare user guard vs reference guard, user impact vs reference impact, etc., and combine scores (e.g. DTW per phase).
- **Live phase + hints**: Each frame, detect current phase (e.g. “extension”) and show 1–2 rules in real time (“Extend arm more”, “Keep rear hand up”).
- **Kick feedback**: Mirror `jabFeedback.ts` for kicking (leg angle, base leg, hip rotation).
- **Tune thresholds**: Adjust `RULES` in `jabFeedback.ts` and `DEFAULT_MATCH_THRESHOLD` in `comparator.ts` per technique or user level.

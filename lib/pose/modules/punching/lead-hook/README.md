# Lead Hook (punching)

Pipeline for **Lead Hook Test** module: user's **left** hand throws the hook, **right** hand in guard (orthodox stance).

## Arm convention

- **Punch (hook):** user's left = MediaPipe **right** (wrist–shoulder distance extends).
- **Guard:** user's right = MediaPipe **left** (contracted, wrist up).

Same as orthodox jab; hook is a curved punch so extension threshold is slightly relaxed (`HOOK_EXTEND_MIN = 0.22`).

## Files

| File | Purpose |
|------|--------|
| **leadHookRepDetector.ts** | Count rep when left (MediaPipe right) extends, right (MediaPipe left) in guard; cooldown after rep. |
| **leadHookFeedback.ts** | Form feedback (reuses orthodox rules, hook wording). |
| **leadHookComparator.ts** | Compare user rep to reference with lead-hook form check. |
| **index.ts** | Exports `leadHookPipeline` and helpers. |

## Registry

Module ID `module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773562287677` is registered to `leadHookPipeline` in `lib/pose/modules/registry.ts`.

## Reference data

CSV and trained ref: `reference/lead-hook-test/`. Upload `ref.json` to Firebase `referencePoseData/{moduleId}` for Try with pose.

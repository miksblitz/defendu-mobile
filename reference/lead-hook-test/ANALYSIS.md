# Lead Hook Test – CSV coordinate analysis

## Data

- **File:** `LeadHookTest_MiksAboyme_pose_data.csv`
- **Frames:** 77 (all labeled `good_rep`)
- **Format:** One row per frame; columns `frame`, `label`, then MediaPipe 33 landmarks as `lm_0_x`, `lm_0_y`, `lm_0_z`, `lm_0_v` … `lm_32_v`.

## MediaPipe arm indices (33-landmark)

| Index | Landmark   | In camera = user |
|-------|------------|------------------|
| 11    | Left shoulder  | User's **right** (guard) |
| 12    | Right shoulder | User's **left** (punching) |
| 13    | Left elbow     | User's right |
| 14    | Right elbow    | User's left |
| 15    | Left wrist     | User's right |
| 16    | Right wrist    | User's left  |

Lead hook = **user's left** hand throws the hook ⇒ **MediaPipe right arm** (12, 14, 16).

---

## Results (from `analyze_csv.py`)

### Guard arm (user's right = MediaPipe left, indices 11 & 15)

- **Wrist–shoulder distance:** min 0.097, max 0.152, mean 0.120  
- Stays **contracted** in all frames.  
- Rep detector uses `GUARD_MAX = 0.22`; the reference guard is well below that.

### Punching arm (user's left = MediaPipe right, indices 12 & 16)

- **Wrist–shoulder distance:** min 0.162, max 0.322, mean 0.265  
- Clear **extension** (max 0.32).  
- `HOOK_EXTEND_MIN = 0.22` and `HOOK_RETRACT_MAX = 0.18` sit in the right range for “extended vs retracted”.

### Punching-arm elbow angle (shoulder 12 – elbow 14 – wrist 16)

- **Min:** 139.5° (more bent)  
- **Max:** 179.8° (almost straight)  
- **Mean:** 166.9°

So the reference clip has a **mix of bend**: some frames with a clear hook bend (e.g. 139–160°) and some with a straighter arm (up to ~180°). The mean is 167°, i.e. often relatively straight.

### Sample frames

| Frame | Right ext (punch) | Right elbow ° | Left ext (guard) |
|-------|-------------------|---------------|-------------------|
| 0     | 0.209             | 163.1         | 0.122             |
| 38    | 0.229             | 157.5         | 0.142             |
| 76    | 0.290             | 167.5         | 0.106             |

---

## Implications for the rep detector

1. **Arm roles**  
   The CSV matches the current logic: **right arm (MediaPipe)** = punching, **left arm (MediaPipe)** = guard. No change needed.

2. **Extension thresholds**  
   - Extension: 0.22–0.32 in the reference ⇒ `HOOK_EXTEND_MIN = 0.22` is reasonable.  
   - Guard: all &lt; 0.22 ⇒ `GUARD_MAX = 0.22` is safe.

3. **Straight arm vs hook**  
   Because the reference itself has elbow angles up to ~180° and mean 167°, a strict “hook bend” rule (e.g. reject if elbow ≥ 162°) would reject many of these reference frames.  
   So either:
   - **No elbow check in the rep detector** (current behaviour): any extended lead arm counts as a rep; straight vs hook can be feedback-only, or  
   - **Relax the elbow threshold** (e.g. only reject when elbow &gt; 170° or 172°) so most of this reference still counts as hook.

---

## How to re-run the analysis

```bash
python reference/lead-hook-test/analyze_csv.py
```

Requires the CSV at `reference/lead-hook-test/LeadHookTest_MiksAboyme_pose_data.csv`.

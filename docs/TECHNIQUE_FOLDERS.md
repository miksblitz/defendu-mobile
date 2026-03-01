# Technique folders (one place per technique)

Everything for pose training lives in **one folder**: `reference/`. Each technique has its own subfolder where you put **both** your videos and the extracted JSON files.

## Folder layout

```
reference/
  punching/         → jabs, hooks, uppercuts, crosses. Put videos here; script outputs ref_*.json here too
  kicking/           → front kick, roundhouse, side kick, etc.
  elbow-strike/      → elbow strikes
  defensive-moves/   → blocks, parries, slips, evasions
```

No separate “videos” vs “poses” folders—one `reference/punching/` (or kicking, etc.) holds both.

## Quick reference

| Technique type   | Folder | Typical `--focus` |
|------------------|--------|-------------------|
| Punching         | `reference/punching/`  | `punching` |
| Kicking          | `reference/kicking/`   | `kicking`  |
| Elbow strike     | `reference/elbow-strike/` | `punching` |
| Defensive moves  | `reference/defensive-moves/` | `punching` or default |

**Example:** Put `jab_ref.MOV` in `reference/punching/`, then run:

```bash
python scripts/extract_reference_pose.py reference/punching/jab_ref.MOV -o reference/punching/ref_jab.json --focus punching
```

See **reference/README.md** and **scripts/README.md** for full usage.

**If you had the old layout:** Move any videos from `reference-videos/` (or `reference-videos/punching/`, etc.) into `reference/punching/` (or the matching technique folder). Move any JSON files from `reference-poses/` into the same `reference/...` folders. Then you can delete the empty `reference-videos` and `reference-poses` folders.

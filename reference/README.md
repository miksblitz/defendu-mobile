# Reference folder (one place per technique)

Put **everything** for pose training here: your technique videos and the extracted JSON files. One folder per technique, no separate “videos” vs “poses” folders.

```
reference/
  punching/         → jabs, hooks, uppercuts. Put .mp4/.MOV here and run script → ref_*.json goes here too
  kicking/           → kicks. Same: videos + ref_*.json
  elbow-strike/      → elbow strikes
  defensive-moves/   → blocks, parries, slips
```

**Example (jab):**

1. Put your video in `reference/punching/jab_ref.MOV`.
2. From defendu-mobile run:
   ```bash
   python scripts/extract_reference_pose.py reference/punching/jab_ref.MOV -o reference/punching/ref_jab.json --focus punching
   ```
3. The JSON is in the same folder. Upload it and set `referencePoseSequenceUrl` on the module.

Videos (`.mp4`, `.MOV`, etc.) in `reference/` are in `.gitignore` so they aren’t committed; the `.json` files can be committed if you want.

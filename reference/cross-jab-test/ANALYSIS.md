# Cross Jab Test – Coordinate & reference analysis

## What this file is

**CrossJabTest_MiksAboyme_pose_data.csv** is pose data extracted from your reference video. Each row = one frame. The coordinates are the **reference** the app uses to know what a “perfect rep” looks like.

---

## 1. Perfect reps in the data

- **All 41 rows** in the CSV are labeled **`good_rep`**.
- So every frame in this file is treated as part of the **reference** for a correct cross jab.
- There are no “bad” or “other” labels; the whole file is the definition of a good rep.

**Frames (examples):** 144, 208, 212, 218, 223, 274, 278, 282, 333, 336, 338, 342, 396, 399, … (41 frames total).

So: **“Which are the perfect reps?”** → **All of them.** This CSV is 41 frames of reference (one or more good cross jabs in sequence).

---

## 2. What the coordinates say (cross jab check)

MediaPipe landmarks used for arms:

- **Left arm:** shoulder 11, wrist 15  
- **Right arm:** shoulder 12, wrist 16  

For a **cross jab** we expect:

- **Right arm** (punching) **more extended** → right wrist–shoulder distance **larger**
- **Left arm** (guard) **more contracted** → left wrist–shoulder distance **smaller**

Sample from **frame 144** (first data row):

- Left shoulder (lm_11): ~(0.477, 0.587), left wrist (lm_15): ~(0.438, 0.661)  
  → left extension ≈ **0.08**
- Right shoulder (lm_12): ~(0.513, 0.642), right wrist (lm_16): ~(0.446, 0.444)  
  → right extension ≈ **0.21**

So **right > left** in that frame. That matches **cross jab** (right hand jabs, left hand in guard). The same pattern holds across the file: the data is consistent with “right punch, left guard.”

So: **“Analyze the coordinates”** → They already encode **perfect reps** (all `good_rep`) and show **right arm extended, left arm in guard**, which is exactly what the Cross Jab Test pipeline uses.

---

## 3. Reference video vs coordinates

- The **reference video** is the source your pose extractor used to produce this CSV.
- The **coordinates in the CSV** are the “analyzed reference”: pose per frame.
- The app does **not** load the video; it only needs the **pose data** (this CSV, or a JSON built from it).

So: **“Analyze the reference video”** = use this CSV as the reference. The CSV *is* the analyzed reference (one frame per row, all perfect reps).

---

## 4. How the app uses this

- The **Cross Jab Test** pipeline (`lib/pose/modules/punching/cross/`) already defines:
  - **Rep detection:** right extends, left in guard, with retract→extend.
  - **Form check:** jab with right hand, left hand in guard.
- If you **load this CSV as reference** (e.g. turn it into a `ref.json` and serve it or put it in Firebase), the app will:
  - Compare the user’s pose to these 41 frames (or the sequence you built from them).
  - Count a rep when the user’s motion matches this reference **and** passes the cross-jab form rules.

No extra “training command” is required for the **logic**; the analysis of what a perfect rep is comes from this coordinate data and the cross-jab rules above.

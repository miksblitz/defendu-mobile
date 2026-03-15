# Cross Jab Test – reference data

Cross jab = **right hand punches**, **left hand in guard**. The CSV is your **reference**: it’s the analyzed pose data (from your reference video) that defines “perfect reps.”

## 1. What’s in the CSV

- **Source:** `d:\DEFENDU\pose-data-extractor\punching\CrossJabTest_MiksAboyme_pose_data.csv` (copy it here as `good_rep.csv` if you want to build ref JSON in this folder).
- **Content:** 41 frames, all labeled **`good_rep`** → every frame is treated as a **perfect rep**.
- **Columns:** `frame`, `label`, and MediaPipe landmarks `lm_0_x` … `lm_32_v`.

See **ANALYSIS.md** in this folder for how the coordinates were analyzed (right arm extended, left in guard = cross jab).

## 2. Using this as the reference

The app compares the user’s pose to this data. You can:

- **Option A (no server):** Build `ref.json` from the CSV (using `scripts/train_module_from_csv.py ... --output reference/cross-jab-test/ref.json`) and load that ref in the app if you add a path or URL for it.
- **Option B (Firebase):** Build ref JSON, then POST it to your pose-service so it’s stored under `referencePoseData/cross-jab-tester` (or another module ID). The app already loads ref from Firebase when present.

## 3. Pose logic (Cross Jab pipeline)

Under `lib/pose/modules/punching/cross/`:

- **Rep detection:** Right hand extends, left hand in guard; retract→extend required.
- **Form:** Right hand jabs, left hand in guard (contracted, wrist up).

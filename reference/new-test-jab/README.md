# New test jab – reference from CSV

Module ID: `module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773459399866`

This module uses the **default punching pipeline** (jab): the app compares the user’s pose to a reference built from your good-rep CSV(s).

## 1. CSV in this folder

- `good_rep.csv` is included with **one sample frame** (frame 104). For a full reference, paste your remaining rows (same columns) into this file so you have all 20 frames (104, 137, 170, … 715) in one rep, or add more CSV files (one file = one rep).
- Required columns: `frame`, `label`, and either `lm_0_x`, `lm_0_y`, … `lm_32_v` or `0_x`, `0_y`, … `32_visibility`.

You can replace `good_rep.csv` entirely with your own CSV(s) or add more `*.csv` files.

## 2. Train (build reference and write to Firebase)

From the repo root (`defendu-mobile/`):

**Option A – write JSON, then POST with write_ref_to_db:**

```bash
python scripts/train_module_from_csv.py --module-id module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773459399866 --category punching --csv-dir reference/new-test-jab --output reference/new-test-jab/ref.json
python scripts/write_ref_to_db.py reference/new-test-jab/ref.json --module-id module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773459399866 --service-url https://YOUR-POSE-SERVICE_URL
```

**Option B – POST directly (if pose-service is running):**

```bash
python scripts/train_module_from_csv.py --module-id module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773459399866 --category punching --csv-dir reference/new-test-jab --service-url https://YOUR-POSE-SERVICE_URL
```

After this, Firebase will have `referencePoseData/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773459399866` with `sequences` and `focus: "punching"`. The app will load it when you open this module’s “Try with pose” step and compare reps to that reference.

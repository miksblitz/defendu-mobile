# Reference pose extraction (train pose check per module)

This folder has scripts to **extract the “correct” pose from a module’s technique video** so the app can tell if the user’s rep is **right or wrong**.

You are **not** training a new AI. You use the **same** pose model (MediaPipe) to:

1. **Extract** landmarks from the reference video → one “reference rep” (JSON).
2. **Compare** the user’s live rep to that reference in the app (already implemented).

---

## Who provides the reference? (technique video vs your videos)

- **The correct reference = the trainer's technique video.** When a trainer publishes a module, they provide a **technique video** (`techniqueVideoUrl`) — that is the official "correct" movement. The reference pose data should come from **that** video: run the extraction script on the technique video (or its URL), upload the JSON, and set `referencePoseSequenceUrl` on the module. Then "Try with pose" compares the user to the trainer's reference.

- **Your own videos (e.g. lead jab, rear jab) = optional enhancement.** The videos you recorded are not the main reference; they **enhance** the checker. You can run the script on each of your good clips and combine them into one JSON with `"sequences": [ ... ]` (or use a folder of videos). Upload and set `referencePoseSequenceUrl` to that URL. The app then accepts a rep if it matches **the trainer's reference or any of your examples** — so different angles/body types still count as correct. Use the **technique video** for the main reference; use **your videos** optionally as extra sequences to make the AI more flexible.

---

## How to get the reference video (record yourself or use existing)

You need **one video of the correct technique** (one rep, or a clip that contains one rep). No special "training" software—just a video file.

| Option | How |
|--------|-----|
| **Record yourself** | Use your phone or laptop camera. Do one clean rep (e.g. one squat) so your **full body** is visible. Transfer the video to your PC (USB, AirDrop, or upload to Drive/Dropbox and download). |
| **Use the module's technique video** | If the module already has `techniqueVideoUrl`, use that URL (see "From a URL" below) or download the file and use the local path. |
| **Google Drive / cloud** | Upload the video to Google Drive (or Dropbox). Either **download the file** to a folder on your PC and pass the path, or use a **direct download URL** (see below). |

The script runs on your PC (Python + OpenCV + MediaPipe). You give it either a **path to a file** (e.g. a folder you put the video in) or a **direct URL** to the video.

---

## End-to-end flow

| Step | What you do |
|------|-------------|
| 1 | Get the technique video for a module (e.g. `techniqueVideoUrl` or a local file). |
| 2 | Run the extraction script on that video → get a JSON file (one rep of pose frames). |
| 3 | Upload the JSON somewhere public (Firebase Storage, your CDN, etc.) and get a URL. |
| 4 | Set `referencePoseSequenceUrl` on that module in Firebase to that URL. |
| 5 | In the app, “Try with pose” loads the reference and compares each rep: **correct** (green) or **wrong** (no count). |

---

## 1. Extract reference from the technique video

**Requirements:** Python 3, `opencv-python`, `mediapipe`, `numpy`. The script works with current MediaPipe (0.10.30+), which uses the Tasks API.

```bash
pip install opencv-python mediapipe numpy
```

Or from the `defendu-mobile` folder:

```bash
pip install -r scripts/requirements.txt
```

**Windows: if you see "function 'free' not found"**, this is a known MediaPipe bug. Use an older version:
```bash
python -m pip uninstall mediapipe -y
python -m pip install mediapipe==0.10.21
```
Then run the script again.

**Windows: if `pip` is not recognized**, Python may not be on your PATH. Try:
- **Option A:** `py -m pip install opencv-python mediapipe` (Windows Python launcher)
- **Option B:** `python -m pip install opencv-python mediapipe`
- **Option C:** Install Python from [python.org](https://www.python.org/downloads/) and check **"Add Python to PATH"**, then open a **new** terminal and run `pip install opencv-python mediapipe` again.

**Where to run:** Open a terminal and go to the **defendu-mobile** project folder (the one that contains the `scripts` folder). All commands below assume you are in that folder.

```bash
cd path/to/defendu-mobile
```

Use your actual path (e.g. `cd d:\DEFENDU-MOB\defendu-mobile` on Windows). Then run the script. The video path can be relative (e.g. `lead_jab.mp4` if the file is in defendu-mobile) or absolute (e.g. `C:\Videos\lead_jab.mp4`).

**Where to put your videos:** Use the single **reference/** folder: one subfolder per technique (punching, kicking, elbow-strike, defensive-moves). Put the video and the script output in the same folder (e.g. both in `reference/punching/`). See **docs/TECHNIQUE_FOLDERS.md** and **reference/README.md**. Example:

```bash
python scripts/extract_reference_pose.py reference/punching/lead_jab.mp4 -o reference/punching/ref_lead_jab.json --focus punching
```

Video files in `reference/` are in `.gitignore` (by extension); JSON files can be committed. Your video files won’t be committed. Putting videos elsewhere (e.g. Desktop) is fine too—use the full path to the file.

**From a folder (local file):** put the video in any folder on your PC, then pass the path:

```bash
cd defendu-mobile
python scripts/extract_reference_pose.py path/to/technique.mp4 -o reference_squat.json
```

**From a URL (no download needed):** the script can download from a direct link (e.g. your module's `techniqueVideoUrl`, or a direct file link from Dropbox/your server):

```bash
python scripts/extract_reference_pose.py "https://your-server.com/technique.mp4" -o reference_squat.json
```

**Google Drive:** the script needs a **direct download** URL. For a shared file: open the file in Drive → Share → copy link. For a direct download you need the file ID and use: `https://drive.google.com/uc?export=download&id=FILE_ID`. Or download the file to a folder and use the local path as above.

**Dataset (folder of videos):** you can use **multiple videos** as references. Put all videos in one folder (e.g. several recordings of the same exercise), then pass the **folder path**. The script will extract one sequence per video and output `{ "sequences": [ ... ] }`. The app will then treat a rep as correct if it matches **any** of those references (better for different body types or slight style differences).

```bash
python scripts/extract_reference_pose.py path/to/folder/with/videos -o reference_dataset.json
```

**Focus (punching vs kicking vs full):** For striking arts you can compare only the relevant region. Use `--focus punching` for jabs, hooks, uppercuts, elbow strikes (upper body only; legs ignored) or `--focus kicking` for kicks (legs only). The app then checks only that region and does not require the whole body to be in sync.

```bash
python scripts/extract_reference_pose.py reference/punching/lead_jab.mp4 -o reference/punching/ref_jab.json --focus punching
python scripts/extract_reference_pose.py reference/kicking/roundhouse.mp4 -o reference/kicking/ref_roundhouse.json --focus kicking
```

**One video per technique:** Record one clip per stance (e.g. lead jab, rear jab, lead uppercut, rear hook). Put it in the right technique folder under **reference/** (punching, kicking, elbow-strike, defensive-moves) and output the JSON to the same folder. Set `referencePoseSequenceUrl` (and optional `focus` in the JSON) per module. The app does not require the entire body to match—only the focused region (upper body for punching, legs for kicking). See **docs/TECHNIQUE_FOLDERS.md** and **reference/README.md** for the full layout.

**One rep = only part of the video (e.g. 5s–12s):**

```bash
python scripts/extract_reference_pose.py path/to/technique.mp4 -o reference_squat.json --start 5 --end 12
```

**Fewer frames (faster comparison in the app):** use every 2nd or 3rd frame:

```bash
python scripts/extract_reference_pose.py path/to/technique.mp4 -o reference_squat.json --every 2
```

The script writes a JSON file in the format the app expects:

- `{ "sequence": [ frame0, frame1, ... ] }`
- Each frame = array of 33 landmarks: `{ "x", "y", "z?", "visibility?" }` (MediaPipe full body).

---

## 2. Host the JSON and set the module URL

- Upload the generated JSON (e.g. `reference_squat.json`) to **Firebase Storage**, your backend, or any URL the app can fetch.
- In **Firestore** (or your DB), set on the module document:
  - `referencePoseSequenceUrl` = that JSON URL.

The app already loads `module.referencePoseSequenceUrl` when the user enters “Try with pose” and uses it to compare each rep.

---

## 3. Correct vs wrong in the app

- **Comparison:** The app normalizes both the reference and the user’s rep (center on hips, scale by body size), then computes a **mean per-frame distance** between the two sequences. If the distance is **below a threshold**, the rep counts as **correct** (green).
- **Threshold:** Default is `0.15` in `lib/pose/comparator.ts` (`DEFAULT_MATCH_THRESHOLD`). If too many good reps are rejected, **lower** the threshold (e.g. `0.12`); if bad reps are accepted, **raise** it (e.g. `0.18`). You can also pass a different threshold per module later if needed.
- **Practice mode:** If a module has **no** `referencePoseSequenceUrl`, “Try with pose” still works: every detected rep counts, so users can complete the step without a reference. Add the URL when you have the reference JSON.

---

## Summary

| Question | Answer |
|----------|--------|
| How do I “train” the pose AI? | You don’t train a new model. You **extract** pose from the reference video (this script) and **compare** user reps to it (app already does this). |
| How do I get reference data from the video? | Run `extract_reference_pose.py` on the video (or a **folder** of videos for a dataset) → get JSON → upload and set `referencePoseSequenceUrl`. |
| Can I use a dataset (multiple videos)? | Yes. Pass a **folder path**; script outputs `{ "sequences": [...] }`. The app matches the user to **any** reference. |
| How does the app know correct vs wrong? | It compares the user’s rep (sequence of pose frames) to the reference using normalized landmark distance; below threshold = correct. |
| How do I make it stricter or looser? | Change `DEFAULT_MATCH_THRESHOLD` in `lib/pose/comparator.ts`, or add per-module threshold later. |

For more detail (normalization, DTW, rep detection), see **docs/POSE_ESTIMATION_IMPLEMENTATION.md**.

**Step-by-step training (start with jabs):** See **docs/TRAINING_POSE_JABS.md** for how to know your reference videos are being read and how to train so "Try with pose" recognizes a simple jab on the mobile camera.

**Technique folders (one reference/ folder per type):** See **docs/TECHNIQUE_FOLDERS.md** and **reference/README.md** for the folder layout so training stays organized.

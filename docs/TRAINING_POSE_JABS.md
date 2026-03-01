# Training pose estimation: start with basic jabs

This guide gets you from zero to the app **recognizing a simple jab** when you use "Try with pose" on your phone. We keep it small and repeatable.

---

## How you know the reference videos are being read

**On the PC (when you “train”):**

1. **Script output** — When you run the extraction script, it prints something like:
   - `Wrote 1294 frames to ref_lead_jab.json (focus=punching).`
   That means the video was **read frame by frame** and pose was **extracted** (33 landmarks per frame). The JSON file is the “understood” version of your video.

2. **Check the JSON** — Open `ref_lead_jab.json` in a text editor. You should see:
   - `"sequence": [ [ { "x", "y", "z", "visibility" }, ... ], ... ]` (one array per frame).
   - If the file has many frames and each frame has 33 landmarks, the AI (MediaPipe) has “read” the video.

**On the phone (when you use “Try with pose”):**

3. **“Reference loaded” in the app** — When you open “Try with pose” for a module that has `referencePoseSequenceUrl` set, the app fetches that JSON. You’ll see a green line under the hints: **“Reference loaded (punching) — 1 sequence”** (or “N examples” if you used multiple videos). That confirms the app **loaded and is using** your reference.

4. **Rep detected + green or “No match”** — When you do a jab:
   - If you see **“Rep detected”** (red) or **green + number**, the **live camera** is being read and compared to the reference. Red = rep was detected but didn’t match; green = it matched.

So: **script output + JSON file** = video was read on PC. **“Reference loaded” + rep feedback** = reference is loaded and comparison is running on the phone.

---

## Step-by-step: train for a simple jab (mobile camera)

### Step 1 — One clean reference video (one jab)

- Use the **trainer’s technique video** for the jab (if the module already has one), or record **one short clip** of yourself doing **one clear jab** (arm extends forward then retracts).
- Tips:
  - **Upper body in frame** (shoulders, arms visible; face optional).
  - **Front-facing** camera.
  - **Good lighting**, minimal clutter behind you.
  - **One jab per clip** (or we’ll trim to one rep in the script).
- Put the video in `defendu-mobile/reference/punching/` (e.g. `jab_ref.MOV`). See **docs/TECHNIQUE_FOLDERS.md** for the full folder layout (one `reference/` folder per technique type).

### Step 2 — Extract pose from that video (PC)

From the `defendu-mobile` folder:

```bash
python scripts/extract_reference_pose.py reference/punching/jab_ref.MOV -o reference/punching/ref_jab.json --focus punching
```

- **Proof it was read:** You should see `Wrote N frames to reference/punching/ref_jab.json (focus=punching).`
- If the clip is long, trim to one jab (e.g. first 1–2 seconds):

  ```bash
  python scripts/extract_reference_pose.py reference/punching/jab_ref.MOV -o reference/punching/ref_jab.json --focus punching --start 0 --end 2
  ```

- Optional: use `--every 2` to keep fewer frames (faster comparison):  
  `--every 2` → about half the frames.

### Step 3 — Upload the JSON and set the module URL

**Where the JSON file is:**

- The script writes the file to the path you give with `-o`. Using the single reference folder, the file is e.g. **`reference/punching/ref_jab.json`** (same folder as your video). Open that path in File Explorer or your editor to confirm the file exists.

**How to put the JSON on a server and get a public URL (Firebase Storage):**

1. Go to **[Firebase Console](https://console.firebase.google.com/)** and open your project (e.g. Defendu).
2. In the left menu, click **Build → Storage**. If Storage isn’t set up yet, click **Get started** and accept the default rules.
3. In Storage, open the **Files** tab. Click **Upload file**.
4. Choose your JSON file (e.g. `reference/punching/ref_jab.json`). After upload, click the file name in the list.
5. In the file details, find **Download URL** (or a “Get link” / copy icon). Copy that URL — it will look like:
   - `https://firebasestorage.googleapis.com/v0/b/defendu-e7970.firebasestorage.app/o/ref_jab.json?alt=media&token=...`
   That’s your **public URL** for the JSON.

**Where to set that URL (Firebase Realtime Database):**

- Your app uses **Firebase Realtime Database** (not Firestore). Modules live under `modules` in the database.
1. In Firebase Console, go to **Build → Realtime Database** and open the **Data** tab.
2. Expand the **modules** node. You’ll see one child per module (each key is a `moduleId`).
3. Click the module that teaches the jab (or the one you’re training). Add or edit a field:
   - **Key:** `referencePoseSequenceUrl`
   - **Value:** paste the URL you copied from Storage (the full `https://...` string).
4. Save. From then on, when a user opens “Try with pose” for that module, the app fetches the reference from that URL.

**Do I have to do this for every module?**

- **Only for modules where you want pose comparison.** If a module has **no** `referencePoseSequenceUrl`, “Try with pose” still works in **practice mode**: reps are detected and count, but the app doesn’t compare to a reference (no green/red match).
- So: one module = one technique (e.g. lead jab). If you want “correct vs wrong” for that technique, you set **one** URL on **that** module in Realtime Database. Another module (e.g. rear jab) gets its **own** reference JSON and its **own** URL. You don’t have to set a URL on every module—only on the ones where you’ve prepared a reference and want matching.

### Step 4 — Test on the phone (“Try with pose”)

1. Open the app → that module → **“Try with pose”**.
2. Allow camera if prompted.
3. **Confirm “Reference loaded”:** Under the hints you should see **“Reference loaded (punching) — 1 sequence”**. If you see **“Practice mode (no reference yet)”**, the URL isn’t set or the JSON didn’t load.
4. **Do a jab:** Upper body in frame, then extend one arm forward (jab) and bring it back.
5. **Interpret feedback:**
   - **Green + number** → rep matched the reference; the AI recognized the jab.
   - **“Rep detected” (red)** → rep was detected but didn’t match; try again (closer to reference speed/range) or loosen the threshold (see below).
   - **Nothing** → rep not detected; make sure arm **extends then retracts** clearly and upper body is visible.

### Step 5 — Optional: add more examples (your videos as enhancement)

- Record a few more **good jabs** (different angle or hand). Put them in `reference/punching/`.
- Run the script on the **folder** to get one JSON with multiple sequences:

  ```bash
  python scripts/extract_reference_pose.py reference/punching -o reference/punching/ref_jab_dataset.json --focus punching
  ```

- Upload `ref_jab_dataset.json` (from `reference/punching/`) and set `referencePoseSequenceUrl` to that URL. The app will then accept a rep if it matches **any** of those jabs (“Reference loaded (punching) — N examples”).

### Step 6 — Tune if needed

- **Too strict (good jabs get “Rep detected” / red):** In `lib/pose/comparator.ts`, increase `DEFAULT_MATCH_THRESHOLD` (e.g. from `0.20` to `0.24` or `0.28`).
- **Too loose (bad form gets green):** Decrease the threshold (e.g. to `0.16` or `0.18`).

---

## Quick checklist (jab only)

| Step | What to do | How you know it worked |
|------|------------|-------------------------|
| 1 | One short jab video in `reference/punching/` | File is in the folder |
| 2 | Run script with `--focus punching`, output to `reference/punching/` | Terminal: “Wrote N frames to … ref_jab.json” |
| 3 | Upload JSON, set `referencePoseSequenceUrl` on module | Realtime Database has the URL |
| 4 | Open “Try with pose” on phone | Screen shows “Reference loaded (punching)” |
| 5 | Do a jab | Green + number when it matches |

Once one jab is recognized reliably, repeat the same flow for **rear jab**, **hook**, **uppercut**, etc. (one reference per technique, or one dataset per technique). Use `reference/punching/` for all punches; for kicks use `reference/kicking/`, and see **docs/TECHNIQUE_FOLDERS.md** for elbow-strike and defensive-moves.

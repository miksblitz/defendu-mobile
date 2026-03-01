# Modules in the database

## Difficulty levels (Basic / Intermediate / Advanced)

When you open a category (e.g. Punching, Kicking), modules are grouped and shown in this order:

1. **Basic**
2. **Intermediate**
3. **Advanced**
4. **More** (modules with no `difficultyLevel` set)

Set `difficultyLevel` on each module in Firebase to control where it appears. Values must be exactly: `basic`, `intermediate`, or `advanced` (lowercase).

---

## Removing test modules

1. Open **Firebase Console** → your project → **Realtime Database**.
2. Go to the **modules** node.
3. Find test modules (e.g. by title like "Test …" or by `trainerId` if you know the test account).
4. Delete the module key (e.g. `module_xyz_123`) for each test module.  
   You can also delete the same key under **trainerModules** → `<trainerId>` if you want to clean that list.

---

## Adding new modules

New modules are normally created via the app: **Trainers** → **Publish** → fill the form and choose **Basic / Intermediate / Advanced**. After admin approval they appear under the right category and level.

To add or fix data directly in the database, each module under `modules/<moduleId>` should look like this (only required fields are noted):

```json
{
  "moduleId": "module_<trainerUid>_<timestamp>",
  "trainerId": "<firebase auth uid of trainer>",
  "trainerName": "Trainer Full Name",
  "moduleTitle": "Title of the module",
  "description": "Short description.",
  "category": "Punching",
  "difficultyLevel": "basic",
  "status": "approved",
  "introductionType": "text",
  "introduction": "Optional intro text.",
  "introductionVideoUrl": null,
  "techniqueVideoUrl": null,
  "techniqueVideoLink": null,
  "videoDuration": null,
  "thumbnailUrl": null,
  "intensityLevel": 2,
  "spaceRequirements": [],
  "physicalDemandTags": [],
  "repRange": null,
  "trainingDurationSeconds": null,
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000,
  "submittedAt": 1234567890000,
  "certificationChecked": true
}
```

- **category** must be one of: `Punching`, `Kicking`, `Elbow Strikes`, `Palm Strikes`, `Defensive Moves`.
- **difficultyLevel** must be one of: `basic`, `intermediate`, `advanced` (or omit for “More”).
- **status** must be `approved` for the module to show in the app.

After adding or editing a module in `modules/`, add or update the same `moduleId` under `trainerModules/<trainerId>/<moduleId>` with at least:

```json
{
  "moduleId": "module_<trainerUid>_<timestamp>",
  "moduleTitle": "Title of the module",
  "status": "approved",
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000
}
```

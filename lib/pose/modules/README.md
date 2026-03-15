# Per-module pose pipelines

Each **module** has its own folder under a **category**. The folder contains the **exact code** that runs for that module: comparator, rep detector, normalizer, phase detection, pose focus. The app uses this code when the user opens "Try with pose" for that module.

## Folder structure

```
lib/pose/modules/
├── punching/
│   ├── default/                    # Generic punching (arm extension). Used by Jab Tester and any unspecified module.
│   │   └── index.ts
│   └── lead-jab-test-defendu/      # Lead Jab (Defendu): left extended sideways, right guard wrist-up
│       └── index.ts
├── kicking/
│   └── default/
├── elbow_strikes/
│   └── default/
├── knee_strikes/
│   └── default/
├── defensive_moves/
│   └── default/
├── types.ts               # ModulePosePipeline interface
└── registry.ts            # getModulePosePipeline(moduleId, category)
```

- **Category** = one of: `punching`, `kicking`, `elbow_strikes`, `knee_strikes`, `defensive_moves` (matches app categories).
- **default** = pipeline for every module in that category that doesn’t have its own folder.
- **Folder name** = **modulename-trainername** (slug from module title + trainer). Example: `lead-jab-test-defendu`, `jab-tester-defendu`. The registry maps moduleIds to these pipelines.

## What each module folder exports

Each folder has an **index.ts** that exports a **ModulePosePipeline** (see `types.ts`):

- **createRepDetector()** – returns the tick function that detects one rep from the pose stream.
- **compareRepWithFeedback** – compare user rep to one reference; returns match, distance, feedback.
- **compareRepWithFeedbackAny** – compare user rep to multiple references.
- **defaultMatchThreshold** – threshold for “correct” rep.
- **poseFocus** – `punching` | `kicking` | `full`.
- **minFramesForRep** – minimum frames to count a rep (e.g. 3 for lead-jab, 5 for generic).

You can **re-export** from the root pose lib (e.g. `../../../comparator`, `../../../repDetector`) and override only what’s different (e.g. lead-jab-tester only overrides `createRepDetector` and `minFramesForRep`).

## Adding a new module-specific pipeline

1. Add a folder: `lib/pose/modules/<category>/<moduleId>/`.
2. Add `index.ts` that exports a `ModulePosePipeline` (implement or re-export from root and override).
3. In `registry.ts`, register: `register('<category>/<moduleId>', yourPipeline)`.

Example: for a new punching module `module_abc_456`, add `punching/module_abc_456/index.ts` and register `punching/module_abc_456` in the registry. Then when the app opens that module, it will use that pipeline.

## How the app uses it

When opening "Try with pose", the app calls **getModulePosePipeline(moduleId, category)**. If a pipeline is returned, it uses that pipeline’s `createRepDetector`, `compareRepWithFeedback` / `compareRepWithFeedbackAny`, threshold, and `minFramesForRep`. If none is returned, it falls back to the global pose lib and `poseVariant` / `poseFocus` props.

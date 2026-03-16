# Lead Uppercut Test – reference data

## Module

- **Firebase module ID:** `module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773669360613`
- **Category:** Punching (Lead Uppercut Test)

## Data

- Source CSV (outside this repo): `d:\DEFENDU\pose-data-extractor\punching\LeadUpperCut_MiksAboyme_pose_data.csv`  
  Use this as the reference clip (one good rep) when you train the module with your pose-service.

## Pose logic

This module is wired to the **leadUppercutPipeline** under `lib/pose/modules/punching/lead-uppercut/`.

For now it reuses the orthodox jab mechanics:

- **Lead hand (left) punches**, **rear hand (right) in guard**.
- Same arm convention as jab: in the camera view, MediaPipe **right arm** is treated as the punching lead hand, MediaPipe **left arm** as the rear guard.

That means once you upload reference pose data for this module ID under
`referencePoseData/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773669360613`,
“Try with pose” will work end‑to‑end using the same matching and form rules as the orthodox jab, but scoped to this uppercut module.


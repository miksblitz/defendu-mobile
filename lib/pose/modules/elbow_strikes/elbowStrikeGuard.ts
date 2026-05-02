/**
 * Shared “opposite hand up” guard check for lead / right elbow strike modules.
 * Stricter than a loose “hand somewhere near the body” — requires the guard
 * wrist clearly above the shoulder line and the hand tucked (low shoulder→wrist
 * span). Invalid opposite-arm landmarks return false (do not grant a free pass),
 * so missing/occluded guard cannot still count as a good rep.
 */

import type { PoseFrame } from '../../types';

/** Model LEFT arm / user’s right (mirrored selfie): MediaPipe 11/15, MoveNet 5/9 */
const MP_GUARD_LEFT = { ls: 11, lw: 15 };
const MN17_GUARD_LEFT = { ls: 5, lw: 9 };

/** Model RIGHT arm / user’s left (mirrored selfie): MediaPipe 12/16, MoveNet 6/10 */
const MP_GUARD_RIGHT = { rs: 12, rw: 16 };
const MN17_GUARD_RIGHT = { rs: 6, rw: 10 };

export const ELBOW_STRIKE_GUARD_MAX_EXTENSION = 0.28;
/**
 * shoulder.y − wrist.y; image y grows downward, so positive ⇒ wrist above
 * shoulder. 0 = wrist exactly at shoulder line. Keep this lenient: a chin-
 * level guard can briefly dip near the shoulder line during the strike’s
 * shoulder rotation, so we only fail when the wrist is clearly hanging below
 * the shoulder.
 */
export const ELBOW_STRIKE_GUARD_MIN_WRIST_LIFT = -0.02;

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function guardUpFromIndices(
  frame: PoseFrame,
  shoulderIdx: number,
  wristIdx: number
): boolean {
  if (frame.length <= Math.max(shoulderIdx, wristIdx)) return false;
  const shoulder = frame[shoulderIdx];
  const wrist = frame[wristIdx];
  if (!validPoint(shoulder) || !validPoint(wrist)) return false;
  const extension = Math.hypot(wrist!.x - shoulder!.x, wrist!.y - shoulder!.y);
  const wristLift = shoulder!.y - wrist!.y;
  return (
    extension <= ELBOW_STRIKE_GUARD_MAX_EXTENSION &&
    wristLift >= ELBOW_STRIKE_GUARD_MIN_WRIST_LIFT
  );
}

/** Opposite arm when striking with the model’s RIGHT chain (lead elbow module). */
export function isGuardArmModelLeftUp(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP_GUARD_LEFT : MN17_GUARD_LEFT;
  return guardUpFromIndices(frame, idx.ls, idx.lw);
}

/** Opposite arm when striking with the model’s LEFT chain (right elbow module). */
export function isGuardArmModelRightUp(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP_GUARD_RIGHT : MN17_GUARD_RIGHT;
  return guardUpFromIndices(frame, idx.rs, idx.rw);
}

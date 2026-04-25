import type { PoseFrame } from '../../../types';

/** Left arm in landmark layout (MediaPipe 11/13/15 or MoveNet 5/7/9). */
const MP = { ls: 11, le: 13, lw: 15 };
const MN17 = { ls: 5, le: 7, lw: 9 };

/**
 * Same geometry as common MediaPipe tutorials: angle at b between segments (b→a) and (b→c).
 * a = shoulder, b = elbow, c = wrist (tracked arm).
 */
export function calculateAngleMediaPipeStyle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const r =
    Math.atan2(c.y - b.y, c.x - b.x) -
    Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((r * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

export type RightElbowStrikeSnapshot = {
  /** shoulder.y − elbow.y (<0 = elbow above shoulder in image coords). */
  elbowLift: number;
  /** |elbow.x − shoulder.x| — use for lateral “out to the side” spacing. */
  elbowFromShoulder: number;
  /** |wrist.x − shoulder.x| — forearm should continue lateral, not straight up. */
  wristLateralFromShoulder: number;
  wristAboveElbow: number;
  shoulderWrist: number;
  forearmDy: number;
  /** Interior angle at elbow (shoulder–elbow–wrist), matches OpenCV/MediaPipe tutorial arctan2 formula. */
  elbowAngleDeg: number;
};

function snapshotFromLandmarks(
  shoulder: { x: number; y: number },
  elbow: { x: number; y: number },
  wrist: { x: number; y: number }
): RightElbowStrikeSnapshot {
  return {
    elbowLift: shoulder.y - elbow.y,
    elbowFromShoulder: Math.abs(elbow.x - shoulder.x),
    wristLateralFromShoulder: Math.abs(wrist.x - shoulder.x),
    wristAboveElbow: elbow.y - wrist.y,
    shoulderWrist: Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y),
    forearmDy: Math.abs(elbow.y - wrist.y),
    elbowAngleDeg: calculateAngleMediaPipeStyle(shoulder, elbow, wrist),
  };
}

function metricsFromIndices(
  frame: PoseFrame,
  shoulderIdx: number,
  elbowIdx: number,
  wristIdx: number
): RightElbowStrikeSnapshot | null {
  if (frame.length <= Math.max(shoulderIdx, elbowIdx, wristIdx)) return null;
  const shoulder = frame[shoulderIdx];
  const elbow = frame[elbowIdx];
  const wrist = frame[wristIdx];
  if (!validPoint(shoulder) || !validPoint(elbow) || !validPoint(wrist)) return null;
  return snapshotFromLandmarks(shoulder, elbow, wrist);
}

/**
 * This module’s chain: **left** shoulder–elbow–wrist (MediaPipe 11/13/15 or MoveNet 5/7/9).
 */
export function getRightElbowStrikeArmSnapshot(frame: PoseFrame): RightElbowStrikeSnapshot | null {
  if (frame.length > 17) return metricsFromIndices(frame, MP.ls, MP.le, MP.lw);
  return metricsFromIndices(frame, MN17.ls, MN17.le, MN17.lw);
}

/**
 * Allowed band for elbow height vs shoulder: a bit below, a bit above, not exact.
 * (Normalized coords; ~0.2 ≈ ~20% of frame height.)
 */
export const MAX_SHOULDER_ELBOW_LEVEL_Y = 0.22;
/** Require elbow to be above shoulder line by at least a small margin. */
export const MIN_ELBOW_ABOVE_SHOULDER_Y = 0.01;

/** Elbow out to the side; kept moderate so slight angles still pass. */
export const MIN_ELBOW_LATERAL_OFFSET = 0.045;

/** Wrist still lateral enough to avoid pure vertical reach-up. */
export const MIN_WRIST_LATERAL_OFFSET = 0.035;

/** Collapsed / no strike shape. */
export const MIN_FLARE_ANGLE_DEG = 40;
/**
 * Must stay **bent** at the elbow—ramrod-straight “arm straight out” fails.
 * Tutorial interior angle: well under ~180° (we cap around low-150s).
 */
export const MAX_FLARE_ANGLE_DEG = 155;

/**
 * Perfect rep: shoulder-height band + lateral + **bent** elbow (not locked straight).
 * Rejects vertical reach-up (bad level/lateral) and near-straight extension.
 */
export function isRightElbowStrikeAlignedAndFlared(s: RightElbowStrikeSnapshot): boolean {
  if (s.elbowLift < MIN_ELBOW_ABOVE_SHOULDER_Y) return false;
  if (s.elbowLift > MAX_SHOULDER_ELBOW_LEVEL_Y) return false;
  if (s.elbowFromShoulder < MIN_ELBOW_LATERAL_OFFSET) return false;
  if (s.wristLateralFromShoulder < MIN_WRIST_LATERAL_OFFSET) return false;
  if (s.elbowAngleDeg < MIN_FLARE_ANGLE_DEG) return false;
  if (s.elbowAngleDeg > MAX_FLARE_ANGLE_DEG) return false;
  return true;
}

/** @param _contracting unused; kept for API parity with other elbow rep detectors. */
export function isRightElbowStrikeFinalPose(s: RightElbowStrikeSnapshot | null, _contracting: boolean): boolean {
  if (!s) return false;
  return isRightElbowStrikeAlignedAndFlared(s);
}

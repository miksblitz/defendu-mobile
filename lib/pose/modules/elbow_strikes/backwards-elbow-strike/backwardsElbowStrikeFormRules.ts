import type { PoseFrame } from '../../../types';

/** Left arm — trained on BackwardsElbowStrike reference (MediaPipe 11/13/15 or MoveNet 5/7/9). */
const MP = { ls: 11, le: 13, lw: 15 };
const MN17 = { ls: 5, le: 7, lw: 9 };

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

export type BackwardsElbowStrikeSnapshot = {
  /** shoulder.y − elbow.y (negative = elbow lower on screen than shoulder). */
  elbowLift: number;
  wristAboveElbow: number;
  /** |wrist.x − shoulder.x| */
  wristLateralFromShoulder: number;
  /** Interior angle at elbow — near-extension for this strike. */
  elbowAngleDeg: number;
};

function snapshotFromLandmarks(
  shoulder: { x: number; y: number },
  elbow: { x: number; y: number },
  wrist: { x: number; y: number }
): BackwardsElbowStrikeSnapshot {
  return {
    elbowLift: shoulder.y - elbow.y,
    wristAboveElbow: elbow.y - wrist.y,
    wristLateralFromShoulder: Math.abs(wrist.x - shoulder.x),
    elbowAngleDeg: calculateAngleMediaPipeStyle(shoulder, elbow, wrist),
  };
}

function metricsFromIndices(
  frame: PoseFrame,
  shoulderIdx: number,
  elbowIdx: number,
  wristIdx: number
): BackwardsElbowStrikeSnapshot | null {
  if (frame.length <= Math.max(shoulderIdx, elbowIdx, wristIdx)) return null;
  const shoulder = frame[shoulderIdx];
  const elbow = frame[elbowIdx];
  const wrist = frame[wristIdx];
  if (!validPoint(shoulder) || !validPoint(elbow) || !validPoint(wrist)) return null;
  return snapshotFromLandmarks(shoulder, elbow, wrist);
}

/** Left chain: same labeling as MediaPipe full-body / MoveNet 17. */
export function getBackwardsElbowStrikeArmSnapshot(frame: PoseFrame): BackwardsElbowStrikeSnapshot | null {
  if (frame.length > 17) return metricsFromIndices(frame, MP.ls, MP.le, MP.lw);
  return metricsFromIndices(frame, MN17.ls, MN17.le, MN17.lw);
}

/** Elbow clearly **below** shoulder (not level with a sideways flare). */
export const MIN_ELBOW_DROP_BELOW_SHOULDER_Y = 0.14;
export const MAX_ELBOW_DROP_BELOW_SHOULDER_Y = 0.32;

/** Forearm runs up — wrist well above elbow in image space. */
export const MIN_WRIST_RAISE_ABOVE_ELBOW_Y = 0.15;

export const MIN_WRIST_LATERAL_FROM_SHOULDER = 0.02;
export const MAX_WRIST_LATERAL_FROM_SHOULDER = 0.09;

/** Near-straight arm at impact (distinct from bent “sideways” elbow strikes). */
export const MIN_EXTENSION_ANGLE_DEG = 5;
export const MAX_EXTENSION_ANGLE_DEG = 28;

export function isBackwardsElbowStrikeAligned(s: BackwardsElbowStrikeSnapshot): boolean {
  const drop = -s.elbowLift;
  if (drop < MIN_ELBOW_DROP_BELOW_SHOULDER_Y || drop > MAX_ELBOW_DROP_BELOW_SHOULDER_Y) return false;
  if (s.wristAboveElbow < MIN_WRIST_RAISE_ABOVE_ELBOW_Y) return false;
  if (
    s.wristLateralFromShoulder < MIN_WRIST_LATERAL_FROM_SHOULDER ||
    s.wristLateralFromShoulder > MAX_WRIST_LATERAL_FROM_SHOULDER
  ) {
    return false;
  }
  if (s.elbowAngleDeg < MIN_EXTENSION_ANGLE_DEG || s.elbowAngleDeg > MAX_EXTENSION_ANGLE_DEG) return false;
  return true;
}

export function isBackwardsElbowStrikeFinalPose(s: BackwardsElbowStrikeSnapshot | null): boolean {
  if (!s) return false;
  return isBackwardsElbowStrikeAligned(s);
}

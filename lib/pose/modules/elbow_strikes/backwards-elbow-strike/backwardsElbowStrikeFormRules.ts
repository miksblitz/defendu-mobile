import type { PoseFrame } from '../../../types';

/** Left arm landmarks: MediaPipe 11/13/15 or MoveNet 5/7/9. */
const MP = { ls: 11, le: 13, lw: 15 };
const MN17 = { ls: 5, le: 7, lw: 9 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function calculateAngleMediaPipeStyle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const r = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((r * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

export type BackwardsElbowStrikeSnapshot = {
  /** Positive means elbow is behind shoulder on x-axis. */
  elbowBackX: number;
  /** Positive means elbow is above shoulder. */
  elbowLift: number;
  /** Positive means wrist is in front of shoulder on x-axis. */
  wristForwardX: number;
  /** Positive means wrist is below elbow. */
  wristBelowElbowY: number;
  elbowAngleDeg: number;
};

function snapshotFromLandmarks(
  shoulder: { x: number; y: number },
  elbow: { x: number; y: number },
  wrist: { x: number; y: number }
): BackwardsElbowStrikeSnapshot {
  return {
    elbowBackX: elbow.x - shoulder.x,
    elbowLift: shoulder.y - elbow.y,
    wristForwardX: shoulder.x - wrist.x,
    wristBelowElbowY: wrist.y - elbow.y,
    elbowAngleDeg: calculateAngleMediaPipeStyle(shoulder, elbow, wrist),
  };
}

function metricsFromIndices(frame: PoseFrame, shoulderIdx: number, elbowIdx: number, wristIdx: number) {
  if (frame.length <= Math.max(shoulderIdx, elbowIdx, wristIdx)) return null;
  const shoulder = frame[shoulderIdx];
  const elbow = frame[elbowIdx];
  const wrist = frame[wristIdx];
  if (!validPoint(shoulder) || !validPoint(elbow) || !validPoint(wrist)) return null;
  return snapshotFromLandmarks(shoulder, elbow, wrist);
}

export function getBackwardsElbowStrikeSnapshot(frame: PoseFrame): BackwardsElbowStrikeSnapshot | null {
  if (frame.length > 17) return metricsFromIndices(frame, MP.ls, MP.le, MP.lw);
  return metricsFromIndices(frame, MN17.ls, MN17.le, MN17.lw);
}

/** Tuned from BackwardsElbowStrike CSVs, with horizontal (shoulder-level) emphasis. */
export const MIN_ELBOW_BACK_X = 0.02;
/** Negative means elbow moved in front of shoulder (forward strike pattern). */
export const MAX_ELBOW_FRONT_X = -0.015;
/**
 * elbowLift = shoulder.y - elbow.y (positive = elbow above shoulder).
 * Ahmad Revalde CSV good_rep range: 0.138 - 0.234.
 * We add a small buffer so regular users still pass, but exclude elbows lifted to head height.
 */
export const MIN_ELBOW_LIFT = 0.1;
export const MAX_ELBOW_LIFT = 0.28;
export const MIN_WRIST_FORWARD_X = -0.01;
export const MIN_WRIST_BELOW_ELBOW_Y = -0.04;
export const MAX_WRIST_BELOW_ELBOW_Y = 0.24;
export const MIN_ELBOW_ANGLE_DEG = 8;
export const MAX_ELBOW_ANGLE_DEG = 60;

/**
 * Lenient floor on elbow lift, used by the lower-elbow exception below.
 * Original rule required at least MIN_ELBOW_LIFT (0.10 = ~shoulder-height with
 * a small upward tilt). Users testing reported the strict floor was hard to
 * meet, so we additionally accept reps where the elbow finishes a little lower
 * (down to ~4% above shoulder) as long as every other rule still passes.
 */
export const MIN_ELBOW_LIFT_LENIENT = 0.04;

/**
 * ORIGINAL strict check — unchanged. Requires the elbow at or slightly above
 * shoulder height (with a small upward tilt) plus all other geometry rules.
 */
export function isBackwardsElbowStrikeFinalPoseStrict(s: BackwardsElbowStrikeSnapshot | null): boolean {
  if (!s) return false;
  if (s.elbowBackX < MIN_ELBOW_BACK_X) return false;
  if (s.elbowLift < MIN_ELBOW_LIFT) return false;
  if (s.elbowLift > MAX_ELBOW_LIFT) return false;
  if (s.wristForwardX < MIN_WRIST_FORWARD_X) return false;
  if (s.wristBelowElbowY < MIN_WRIST_BELOW_ELBOW_Y) return false;
  if (s.wristBelowElbowY > MAX_WRIST_BELOW_ELBOW_Y) return false;
  if (s.elbowAngleDeg < MIN_ELBOW_ANGLE_DEG) return false;
  if (s.elbowAngleDeg > MAX_ELBOW_ANGLE_DEG) return false;
  return true;
}

/**
 * LOWER-ELBOW EXCEPTION — same shape rules as the strict check, but only the
 * elbow-lift floor is loosened (MIN_ELBOW_LIFT → MIN_ELBOW_LIFT_LENIENT). All
 * other geometry (back direction, wrist forward, wrist below elbow band, bent
 * elbow angle) must still pass — so this only catches reps that look correct
 * but finish with the elbow slightly lower than the textbook tilt.
 */
export function isBackwardsElbowStrikeFinalPoseLowElbow(s: BackwardsElbowStrikeSnapshot | null): boolean {
  if (!s) return false;
  if (s.elbowBackX < MIN_ELBOW_BACK_X) return false;
  if (s.elbowLift < MIN_ELBOW_LIFT_LENIENT) return false;
  if (s.elbowLift > MAX_ELBOW_LIFT) return false;
  if (s.wristForwardX < MIN_WRIST_FORWARD_X) return false;
  if (s.wristBelowElbowY < MIN_WRIST_BELOW_ELBOW_Y) return false;
  if (s.wristBelowElbowY > MAX_WRIST_BELOW_ELBOW_Y) return false;
  if (s.elbowAngleDeg < MIN_ELBOW_ANGLE_DEG) return false;
  if (s.elbowAngleDeg > MAX_ELBOW_ANGLE_DEG) return false;
  return true;
}

export function isBackwardsElbowStrikeFinalPose(s: BackwardsElbowStrikeSnapshot | null): boolean {
  if (!s) return false;
  return (
    isBackwardsElbowStrikeFinalPoseStrict(s) ||
    isBackwardsElbowStrikeFinalPoseLowElbow(s)
  );
}

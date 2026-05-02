import type { PoseFrame } from '../../../types';

/** Left arm in landmark layout (MediaPipe 11/13/15 or MoveNet 5/7/9). */
const MP = { ls: 11, le: 13, lw: 15 };
const MN17 = { ls: 5, le: 7, lw: 9 };
/** Opposite (right) shoulder index, used only to estimate body size for far-distance handling. */
const MP_OPPOSITE_SHOULDER = 12;
const MN17_OPPOSITE_SHOULDER = 6;

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
  /**
   * Shoulder-to-shoulder distance in normalized coords (0…1). Used as a body-size
   * proxy: bigger value = user is closer to the camera, smaller = farther away.
   * `null` when the opposite shoulder landmark isn't available.
   */
  bodyScale: number | null;
};

function snapshotFromLandmarks(
  shoulder: { x: number; y: number },
  elbow: { x: number; y: number },
  wrist: { x: number; y: number },
  bodyScale: number | null
): RightElbowStrikeSnapshot {
  return {
    elbowLift: shoulder.y - elbow.y,
    elbowFromShoulder: Math.abs(elbow.x - shoulder.x),
    wristLateralFromShoulder: Math.abs(wrist.x - shoulder.x),
    wristAboveElbow: elbow.y - wrist.y,
    shoulderWrist: Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y),
    forearmDy: Math.abs(elbow.y - wrist.y),
    elbowAngleDeg: calculateAngleMediaPipeStyle(shoulder, elbow, wrist),
    bodyScale,
  };
}

function metricsFromIndices(
  frame: PoseFrame,
  shoulderIdx: number,
  elbowIdx: number,
  wristIdx: number,
  oppositeShoulderIdx: number
): RightElbowStrikeSnapshot | null {
  if (frame.length <= Math.max(shoulderIdx, elbowIdx, wristIdx)) return null;
  const shoulder = frame[shoulderIdx];
  const elbow = frame[elbowIdx];
  const wrist = frame[wristIdx];
  if (!validPoint(shoulder) || !validPoint(elbow) || !validPoint(wrist)) return null;
  const oppositeShoulder =
    frame.length > oppositeShoulderIdx ? frame[oppositeShoulderIdx] : undefined;
  const bodyScale = validPoint(oppositeShoulder)
    ? Math.hypot(shoulder.x - oppositeShoulder!.x, shoulder.y - oppositeShoulder!.y)
    : null;
  return snapshotFromLandmarks(shoulder, elbow, wrist, bodyScale);
}

/**
 * This module’s chain: **left** shoulder–elbow–wrist (MediaPipe 11/13/15 or MoveNet 5/7/9).
 */
export function getRightElbowStrikeArmSnapshot(frame: PoseFrame): RightElbowStrikeSnapshot | null {
  if (frame.length > 17) {
    return metricsFromIndices(frame, MP.ls, MP.le, MP.lw, MP_OPPOSITE_SHOULDER);
  }
  return metricsFromIndices(frame, MN17.ls, MN17.le, MN17.lw, MN17_OPPOSITE_SHOULDER);
}

/**
 * Allowed band for elbow height vs shoulder: a bit below, a bit above, not exact.
 * (Normalized coords; ~0.2 ≈ ~20% of frame height.)
 */
export const MAX_SHOULDER_ELBOW_LEVEL_Y = 0.22;
/**
 * Lower bound on elbow height vs shoulder (elbowLift = shoulder.y − elbow.y, so
 * positive = elbow above shoulder).
 *
 * Was 0.01 (required a small upward tilt). Lowered to −0.05 so a perfectly
 * horizontal elbow — and a small droop within camera-noise tolerance — also
 * counts as a perfect rep, since users testing the drill tend to skip the
 * slight upward tilt. The slight upward tilt is still allowed (capped by
 * MAX_SHOULDER_ELBOW_LEVEL_Y above).
 */
export const MIN_ELBOW_ABOVE_SHOULDER_Y = -0.05;

/** Elbow out to the side; kept moderate so slight angles still pass. */
export const MIN_ELBOW_LATERAL_OFFSET = 0.045;

/** Wrist still lateral enough to avoid pure vertical reach-up. */
export const MIN_WRIST_LATERAL_OFFSET = 0.035;

/**
 * Collapsed / no strike shape.
 * Lowered from 40° → 10° → 5° after user testing reported the strict band was too hard.
 */
export const MIN_FLARE_ANGLE_DEG = 5;
/**
 * Upper bound on the interior elbow angle.
 * Raised from 155° → 195° (155 + 40) to be more forgiving on near-straight arms.
 * Note: the underlying angle formula geometrically caps at 180°, so 195° is
 * effectively “no upper limit” — any extension up to fully straight passes.
 */
export const MAX_FLARE_ANGLE_DEG = 195;

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

// ---------------------------------------------------------------------------
// Far-distance fallback (additive — does NOT replace the rules above).
// ---------------------------------------------------------------------------
/**
 * Reference shoulder-to-shoulder width when the user is at a "normal" close distance
 * (roughly fills the frame). Used only to scale lateral thresholds when the user
 * is farther away (~1–1.5 m), where the body is smaller in the frame and the
 * absolute lateral offsets shrink proportionally.
 */
export const REFERENCE_BODY_SCALE = 0.25;
/**
 * If shoulder-to-shoulder width is at or below this value, treat the user as
 * "far" (around 1–1.5 m from camera) and use the scaled fallback thresholds.
 * Values above this fall through to the original close-distance rules.
 */
export const FAR_DISTANCE_BODY_SCALE_MAX = 0.18;
/**
 * Floor on body scale, so that an extremely tiny detection (e.g. pose model
 * jitter at very long range) doesn't push thresholds to zero.
 */
const MIN_BODY_SCALE_FOR_FAR = 0.06;

/**
 * Far-distance acceptance: same shape rules as the close-distance check, but the
 * lateral and height thresholds are scaled by (bodyScale / REFERENCE_BODY_SCALE)
 * so the user only needs to flare proportionally to how big they appear in the
 * frame. The angle band and direction (elbow above shoulder) are unchanged.
 *
 * Returns false when:
 *  - bodyScale is unknown (no opposite shoulder), or
 *  - bodyScale is above FAR_DISTANCE_BODY_SCALE_MAX (close enough — fall through
 *    to the original rules), or
 *  - bodyScale is below MIN_BODY_SCALE_FOR_FAR (too tiny to be reliable).
 */
export function isRightElbowStrikeAlignedAndFlaredFarDistance(s: RightElbowStrikeSnapshot): boolean {
  if (s.bodyScale == null) return false;
  if (s.bodyScale > FAR_DISTANCE_BODY_SCALE_MAX) return false;
  if (s.bodyScale < MIN_BODY_SCALE_FOR_FAR) return false;

  const scale = s.bodyScale / REFERENCE_BODY_SCALE;
  const minElbowAbove = MIN_ELBOW_ABOVE_SHOULDER_Y * scale;
  const maxElbowAbove = MAX_SHOULDER_ELBOW_LEVEL_Y * scale;
  const minElbowLateral = MIN_ELBOW_LATERAL_OFFSET * scale;
  const minWristLateral = MIN_WRIST_LATERAL_OFFSET * scale;

  if (s.elbowLift < minElbowAbove) return false;
  if (s.elbowLift > maxElbowAbove) return false;
  if (s.elbowFromShoulder < minElbowLateral) return false;
  if (s.wristLateralFromShoulder < minWristLateral) return false;
  if (s.elbowAngleDeg < MIN_FLARE_ANGLE_DEG) return false;
  if (s.elbowAngleDeg > MAX_FLARE_ANGLE_DEG) return false;
  return true;
}

/** @param _contracting unused; kept for API parity with other elbow rep detectors. */
export function isRightElbowStrikeFinalPose(s: RightElbowStrikeSnapshot | null, _contracting: boolean): boolean {
  if (!s) return false;
  return (
    isRightElbowStrikeAlignedAndFlared(s) ||
    isRightElbowStrikeAlignedAndFlaredFarDistance(s)
  );
}

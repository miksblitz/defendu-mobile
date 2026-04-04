/**
 * Lead high kick — left leg only. Opposite of low kick: knee and ankle stay *above* hip height,
 * with an upward diagonal like "\\" (hip/leg base lower, ankle toward the upper part of the slash).
 *
 * MediaPipe y grows downward; smaller y = higher on screen. Support = right ankle.
 */

import type { PoseFrame } from '../../../types';
import { midHipY, validPoint, MP, MN17 } from '../lead-low-kick/leadLowKickGeometry';

/** Knee must be clearly above hip line (high chamber / extension). */
export const HIGH_KICK_KNEE_MIN_ABOVE_HIP_Y = 0.042;

/** Ankle must sit clearly above hip (foot is “high” — top of the diagonal). */
export const HIGH_KICK_ANKLE_MIN_ABOVE_HIP_Y = 0.028;

/** Kicking foot well above planted right ankle. */
export const HIGH_KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y = 0.095;

/**
 * "\\" from left hip: ankle shifts toward +x (up–right in a typical front/slight-angle frame).
 */
export const HIGH_KICK_ANKLE_MIN_FORWARD_OF_HIP_X = 0.022;

/** hip→ankle direction: strong upward component (hip.y − ankle.y) / len. */
export const HIGH_KICK_MIN_UPWARD_UNIT = 0.36;

/** Avoid pure vertical lift: need horizontal spread. */
export const HIGH_KICK_MIN_HORIZONTAL_UNIT = 0.1;

export const HIGH_KICK_HIP_ANKLE_MIN_LEN = 0.03;

export const HIGH_KICK_KNEE_INTERIOR_MIN_DEG = 38;
export const HIGH_KICK_KNEE_INTERIOR_MAX_DEG = 178;

/** Ankle should stay near top of chain vs knee (not hanging far below knee). */
export const HIGH_KICK_ANKLE_MAX_BELOW_KNEE_Y = 0.055;

function angleDeg(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const baX = a.x - b.x;
  const baY = a.y - b.y;
  const bcX = c.x - b.x;
  const bcY = c.y - b.y;
  const nba = Math.hypot(baX, baY);
  const nbc = Math.hypot(bcX, bcY);
  if (nba === 0 || nbc === 0) return NaN;
  const cos = Math.max(-1, Math.min(1, (baX * bcX + baY * bcY) / (nba * nbc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Left leg high kick strike (orthodox lead leg). */
export function inLeadHighKickStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const hip = frame[idx.lh];
  const knee = frame[idx.lk];
  const ankle = frame[idx.la];
  const supportAnkle = frame[idx.ra];
  const line = midHipY(frame, idx);

  if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle) || !validPoint(supportAnkle) || line == null) {
    return false;
  }

  if (knee.y > hip.y - HIGH_KICK_KNEE_MIN_ABOVE_HIP_Y) return false;
  if (ankle.y > hip.y - HIGH_KICK_ANKLE_MIN_ABOVE_HIP_Y) return false;

  if (ankle.y > knee.y + HIGH_KICK_ANKLE_MAX_BELOW_KNEE_Y) return false;

  if (ankle.x <= hip.x + HIGH_KICK_ANKLE_MIN_FORWARD_OF_HIP_X) return false;

  if (ankle.y > supportAnkle.y - HIGH_KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y) return false;

  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const len = Math.hypot(dx, dy);
  if (len < HIGH_KICK_HIP_ANKLE_MIN_LEN) return false;

  const upwardUnit = (hip.y - ankle.y) / len;
  if (upwardUnit < HIGH_KICK_MIN_UPWARD_UNIT) return false;

  const horizUnit = Math.abs(dx) / len;
  if (horizUnit < HIGH_KICK_MIN_HORIZONTAL_UNIT) return false;

  const ang = angleDeg(hip, knee, ankle);
  if (!Number.isFinite(ang) || ang < HIGH_KICK_KNEE_INTERIOR_MIN_DEG || ang > HIGH_KICK_KNEE_INTERIOR_MAX_DEG) {
    return false;
  }

  return true;
}

/**
 * Lead high kick — same **mirror/selfie** leg as lead low kick: MediaPipe **right** hip/knee/ankle
 * (orthodox lead on a mirrored preview). Unlike low kick, the chamber/extension must read **high**:
 * kicking knee clearly **above** the hip line, foot lifted on an upward diagonal.
 *
 * MediaPipe y grows downward (smaller y = higher on screen). Support = left ankle.
 *
 * Thresholds are very forgiving: partial height, bent knees, and imperfect lines still count.
 */

import type { PoseFrame } from '../../../types';
import { midHipY, validPoint, MP, MN17 } from '../lead-low-kick/leadLowKickGeometry';

/** Knee above hip line — small margin so “almost hip height” or noisy landmarks still pass. */
export const HIGH_KICK_KNEE_MIN_ABOVE_HIP_Y = 0.011;

/** Ankle: only a hint above hip; full extension not required. */
export const HIGH_KICK_ANKLE_MIN_ABOVE_HIP_Y = 0.003;

/** Kicking foot above support — lower bar than before so shorter lifts still register. */
export const HIGH_KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y = 0.045;

/** Lateral spread from hip (either direction). */
export const HIGH_KICK_ANKLE_MIN_ABS_DX = 0.006;

/** hip→ankle upward component — allows more “out” and less “up” than a strict high kick. */
export const HIGH_KICK_MIN_UPWARD_UNIT = 0.17;

/** Horizontal component — allows steeper / more tucked shapes. */
export const HIGH_KICK_MIN_HORIZONTAL_UNIT = 0.028;

export const HIGH_KICK_HIP_ANKLE_MIN_LEN = 0.012;

/** Wide angle band: very bent chamber through nearly straight — leg does not need to look “straight”. */
export const HIGH_KICK_KNEE_INTERIOR_MIN_DEG = 15;
export const HIGH_KICK_KNEE_INTERIOR_MAX_DEG = 180;

/** Foot may trail well below knee (snap, flexibility, camera). */
export const HIGH_KICK_ANKLE_MAX_BELOW_KNEE_Y = 0.11;

/** vs mid-hip: only reject when the foot has clearly dropped to standing-like height. */
export const HIGH_KICK_ANKLE_MAX_BELOW_MIDHIP_Y = 0.15;

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

/** Shared high-kick strike test (lead = right chain, rear = left chain). */
export function oneLegHighKickShape(
  frame: PoseFrame,
  idx: typeof MP | typeof MN17,
  hipIdx: number,
  kneeIdx: number,
  ankleIdx: number,
  supportAnkleIdx: number
): boolean {
  const hip = frame[hipIdx];
  const knee = frame[kneeIdx];
  const ankle = frame[ankleIdx];
  const supportAnkle = frame[supportAnkleIdx];
  const line = midHipY(frame, idx);

  if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle) || !validPoint(supportAnkle)) {
    return false;
  }
  if (line == null) return false;

  // High kick: knee above hip line (reject if knee not lifted enough).
  if (knee.y > hip.y - HIGH_KICK_KNEE_MIN_ABOVE_HIP_Y) return false;
  if (ankle.y > hip.y - HIGH_KICK_ANKLE_MIN_ABOVE_HIP_Y) return false;

  if (ankle.y > knee.y + HIGH_KICK_ANKLE_MAX_BELOW_KNEE_Y) return false;

  if (Math.abs(ankle.x - hip.x) < HIGH_KICK_ANKLE_MIN_ABS_DX) return false;

  if (ankle.y > supportAnkle.y - HIGH_KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y) return false;

  // Lenient: foot should still read above the overall hip band (handles lean / short clips).
  if (ankle.y > line + HIGH_KICK_ANKLE_MAX_BELOW_MIDHIP_Y) return false;

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

/** Lead high kick — MP **right** leg chain (mirrored preview ≈ orthodox lead leg), same as lead low. */
export function inLeadHighKickStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  return oneLegHighKickShape(frame, idx, idx.rh, idx.rk, idx.ra, idx.la);
}

/**
 * Shared low-kick strike geometry (one leg per module; **mirror/selfie convention**).
 *
 * Phone preview is usually mirrored: an orthodox **lead** leg (left side of body) appears on the
 * **image right** — MediaPipe’s right hip/knee/ankle chain. `LeadLowKick_*` reference data matches
 * that (kicking foot = right chain). Rear low kick uses the opposite chain (image left / MP left leg).
 *
 * Geometry rejects a **chambered** knee: kicking knee must stay at or below the hip (small
 * tolerance, `KICK_KNEE_MAX_CLEAR_ABOVE_HIP_Y`). Otherwise a rep is a low diagonal swing — foot off
 * the support side, knee may flex; hip→knee and knee→ankle need not be collinear.
 *
 * Image: MediaPipe y grows downward. Support is the non-kicking ankle.
 */

import type { PoseFrame } from '../../../types';

export const MP = { lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
export const MN17 = { lh: 11, rh: 12, lk: 13, rk: 14, la: 15, ra: 16 };

/**
 * Kicking ankle must sit clearly above the support ankle (smaller Y). Standing feet differ by
 * only a tiny amount; require real separation so idle stance doesn’t count as a kick.
 */
export const KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y = 0.082;

/**
 * Kicking knee must not sit clearly above the kicking hip (y-down image coords: high chamber =
 * knee.y ≪ hip.y). Allowed lift is tiny for landmark noise / angle only — not a knee strike chamber.
 */
export const KICK_KNEE_MAX_CLEAR_ABOVE_HIP_Y = 0.035;

/**
 * Kicking ankle must be lifted toward the hip line — not planted in the usual standing band.
 * midHipY + this ≈ upper bound for strike ankle Y; planted feet usually sit higher (larger Y).
 */
export const KICK_FOOT_MAX_Y_VS_MIDHIP = 0.26;

/**
 * Interior angle at the kicking knee (hip–knee–ankle). Soft diagonal chain: not folded, not
 * treating ruler-straight as required — wide band for “slightly bent” low kicks.
 */
export const KICK_KNEE_INTERIOR_MIN_DEG = 55;
export const KICK_KNEE_INTERIOR_MAX_DEG = 179;

/** Hip→ankle direction must look slanted (not flat on floor, not purely vertical). */
export const DIAGONAL_MIN_UNIT_COMPONENT = 0.085;

export const HIP_ANKLE_MIN_LEN_NORM = 0.026;

/** @deprecated aliases */
export const KICK_LEG_CHAIN_ANGLE_MIN_DEG = KICK_KNEE_INTERIOR_MIN_DEG;
export const KICK_LEG_CHAIN_ANGLE_MAX_DEG = KICK_KNEE_INTERIOR_MAX_DEG;
export const RIGHT_KICK_LEG_ANGLE_MIN_DEG = KICK_KNEE_INTERIOR_MIN_DEG;
export const RIGHT_KICK_LEG_ANGLE_MAX_DEG = KICK_KNEE_INTERIOR_MAX_DEG;

export const RESET_FEET_LEVEL_MAX_DY = 0.24;
export const RESET_RIGHT_ANKLE_WITHIN_SUPPORT_ANKLE_Y = 0.09;
export const RESET_FOOT_DOWN_BELOW_HIP = 0.12;

export function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function getIdx(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > MP.ra) return MP;
  if (frame.length > MN17.ra) return MN17;
  return null;
}

export function midHipY(frame: PoseFrame, idx: typeof MP | typeof MN17): number | null {
  const lh = frame[idx.lh];
  const rh = frame[idx.rh];
  if (!validPoint(lh) || !validPoint(rh)) return null;
  return (lh.y + rh.y) / 2;
}

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

export function leftKneeInteriorAngleDeg(frame: PoseFrame, idx: typeof MP | typeof MN17): number | null {
  const hip = frame[idx.lh];
  const knee = frame[idx.lk];
  const ankle = frame[idx.la];
  if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle)) return null;
  const a = angleDeg(hip, knee, ankle);
  return Number.isFinite(a) ? a : null;
}

export function rightKneeInteriorAngleDeg(frame: PoseFrame, idx: typeof MP | typeof MN17): number | null {
  const hip = frame[idx.rh];
  const knee = frame[idx.rk];
  const ankle = frame[idx.ra];
  if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle)) return null;
  const a = angleDeg(hip, knee, ankle);
  return Number.isFinite(a) ? a : null;
}

function hipAnkleDiagonalOk(hip: { x: number; y: number }, ankle: { x: number; y: number }): boolean {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const len = Math.hypot(dx, dy);
  if (len < HIP_ANKLE_MIN_LEN_NORM) return false;
  const nx = Math.abs(dx) / len;
  const ny = Math.abs(dy) / len;
  return nx >= DIAGONAL_MIN_UNIT_COMPONENT && ny >= DIAGONAL_MIN_UNIT_COMPONENT;
}

function oneLegLowKickShape(
  frame: PoseFrame,
  idx: typeof MP | typeof MN17,
  hipIdx: number,
  kneeIdx: number,
  ankleIdx: number,
  supportAnkleIdx: number
): boolean {
  const line = midHipY(frame, idx);
  const hip = frame[hipIdx];
  const knee = frame[kneeIdx];
  const ankle = frame[ankleIdx];
  const supportAnkle = frame[supportAnkleIdx];
  if (line == null || !validPoint(hip) || !validPoint(knee) || !validPoint(ankle) || !validPoint(supportAnkle)) {
    return false;
  }

  // Low kick: thigh should swing out, not chamber high — reject knee meaningfully above hip line.
  if (knee.y < hip.y - KICK_KNEE_MAX_CLEAR_ABOVE_HIP_Y) return false;

  if (ankle.y > supportAnkle.y - KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y) return false;
  if (ankle.y > line + KICK_FOOT_MAX_Y_VS_MIDHIP) return false;

  const ang = angleDeg(hip, knee, ankle);
  if (!Number.isFinite(ang) || ang < KICK_KNEE_INTERIOR_MIN_DEG || ang > KICK_KNEE_INTERIOR_MAX_DEG) {
    return false;
  }

  if (!hipAnkleDiagonalOk(hip, ankle)) return false;

  return true;
}

function rightLegLowKickShape(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  return oneLegLowKickShape(frame, idx, idx.rh, idx.rk, idx.ra, idx.la);
}

function leftLegLowKickShape(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  return oneLegLowKickShape(frame, idx, idx.lh, idx.lk, idx.la, idx.ra);
}

/** Lead low kick — MP **right** leg chain (mirrored preview ≈ orthodox lead leg). */
export function inLeadLowKickStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  return rightLegLowKickShape(frame, idx);
}

/** Rear low kick — MP **left** leg chain (mirrored preview ≈ orthodox rear leg). */
export function inRearLowKickStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  return leftLegLowKickShape(frame, idx);
}

export function leadLowKickResetPose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const la = frame[idx.la];
  const ra = frame[idx.ra];
  if (!validPoint(la) || !validPoint(ra)) return false;
  if (Math.abs(la.y - ra.y) > RESET_FEET_LEVEL_MAX_DY) return false;
  const line = midHipY(frame, idx);
  if (line == null) return false;
  const lowestAnkleY = Math.max(la.y, ra.y);
  return lowestAnkleY >= line - 0.08;
}

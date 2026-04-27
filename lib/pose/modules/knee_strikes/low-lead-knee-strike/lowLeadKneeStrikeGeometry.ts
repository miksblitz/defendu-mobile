/**
 * Low lead knee strike — right leg.
 *
 * Literal rule (your request): knee must stay **on or below** the mid-hip horizontal line
 * in image space (MediaPipe Y grows downward → “under” hip means rk.y is not smaller
 * than midHipY except through small tracking slack).
 *
 * Also requires a **bent** knee so a neutral standing pose doesn’t count as a strike.
 */

import type { PoseFrame } from '../../../types';

export const MP = { lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
export const MN17 = { lh: 11, rh: 12, lk: 13, rk: 14, la: 15, ra: 16 };

/** Max how far the knee may sit *above* the hip line (tiny Y slack only). */
export const UNDER_HIP_LINE_SLACK = 0.03;

/**
 * After a rep, knee should sit clearly below the hip line again (neutral / leg down).
 */
export const RESET_BELOW_HIP_MIN = 0.018;
/** Feet must be roughly level again before a new rep can start. */
export const RESET_FEET_LEVEL_MAX_DY = 0.2;
/** Both ankles must be back down near/below hip line (y-down coordinates). */
export const RESET_ANKLE_DOWN_MIN_VS_HIP = -0.06;

/** Hip–knee–ankle angle: must be bent enough to be a strike, not a straight leg. */
export const ANGLE_MIN_DEG = 48;
export const ANGLE_MAX_DEG = 135;

/** Optional form scoring: rolling window / short rep (lenient around typical chambers). */
export const ANGLE_WINDOW = 5;
export const ANGLE_WINDOW_MEAN_MIN = 50;
export const ANGLE_WINDOW_MEAN_MAX = 110;
export const ANGLE_SHORT_REP_MEAN_MIN = 48;
export const ANGLE_SHORT_REP_MEAN_MAX = 115;

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

/** True if right knee is at or below mid-hip line (lenient slack). */
export function rightKneeOnOrBelowMidHip(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const line = midHipY(frame, idx);
  const rk = frame[idx.rk];
  if (line == null || !validPoint(rk)) return false;
  return rk.y >= line - UNDER_HIP_LINE_SLACK;
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

export function rightKneeAngleDeg(frame: PoseFrame, idx: typeof MP | typeof MN17): number | null {
  const hip = frame[idx.rh];
  const knee = frame[idx.rk];
  const ankle = frame[idx.ra];
  if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle)) return null;
  const a = angleDeg(hip, knee, ankle);
  return Number.isFinite(a) ? a : null;
}

export function inLowLeadStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  if (!rightKneeOnOrBelowMidHip(frame, idx)) return false;
  const ang = rightKneeAngleDeg(frame, idx);
  if (ang == null) return false;
  return ang >= ANGLE_MIN_DEG && ang <= ANGLE_MAX_DEG;
}

/** Leg returned toward neutral: knee clearly below hip line. */
export function lowLeadResetPose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const line = midHipY(frame, idx);
  const rk = frame[idx.rk];
  const ra = frame[idx.ra];
  const la = frame[idx.la];
  if (line == null || !validPoint(rk) || !validPoint(ra) || !validPoint(la)) return false;
  if (rk.y < line + RESET_BELOW_HIP_MIN) return false;
  if (Math.abs(ra.y - la.y) > RESET_FEET_LEVEL_MAX_DY) return false;
  return ra.y >= line + RESET_ANKLE_DOWN_MIN_VS_HIP && la.y >= line + RESET_ANKLE_DOWN_MIN_VS_HIP;
}

/**
 * Low rear knee strike — **left** leg (opposite of low lead).
 * Same rules as low lead: knee on/below mid-hip line + bent knee; reset with knee clearly down.
 */

import type { PoseFrame } from '../../../types';

export const MP = { lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
export const MN17 = { lh: 11, rh: 12, lk: 13, rk: 14, la: 15, ra: 16 };

export const UNDER_HIP_LINE_SLACK = 0.03;
export const RESET_BELOW_HIP_MIN = 0.018;
export const RESET_FEET_LEVEL_MAX_DY = 0.2;
export const RESET_ANKLE_DOWN_MIN_VS_HIP = -0.06;
export const ANGLE_MIN_DEG = 48;
export const ANGLE_MAX_DEG = 135;
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

export function leftKneeOnOrBelowMidHip(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const line = midHipY(frame, idx);
  const lk = frame[idx.lk];
  if (line == null || !validPoint(lk)) return false;
  return lk.y >= line - UNDER_HIP_LINE_SLACK;
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

export function leftKneeAngleDeg(frame: PoseFrame, idx: typeof MP | typeof MN17): number | null {
  const hip = frame[idx.lh];
  const knee = frame[idx.lk];
  const ankle = frame[idx.la];
  if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle)) return null;
  const a = angleDeg(hip, knee, ankle);
  return Number.isFinite(a) ? a : null;
}

export function inLowRearStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  if (!leftKneeOnOrBelowMidHip(frame, idx)) return false;
  const ang = leftKneeAngleDeg(frame, idx);
  if (ang == null) return false;
  return ang >= ANGLE_MIN_DEG && ang <= ANGLE_MAX_DEG;
}

export function lowRearResetPose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const line = midHipY(frame, idx);
  const lk = frame[idx.lk];
  const la = frame[idx.la];
  const ra = frame[idx.ra];
  if (line == null || !validPoint(lk) || !validPoint(la) || !validPoint(ra)) return false;
  if (lk.y < line + RESET_BELOW_HIP_MIN) return false;
  if (Math.abs(la.y - ra.y) > RESET_FEET_LEVEL_MAX_DY) return false;
  return la.y >= line + RESET_ANKLE_DOWN_MIN_VS_HIP && ra.y >= line + RESET_ANKLE_DOWN_MIN_VS_HIP;
}

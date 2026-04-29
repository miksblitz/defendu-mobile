/**
 * Side kick strike geometry (endpoint-focused).
 * Detects a final pose where the right leg is extended to the side.
 * Tuned between low and high kick: side-focused, around hip height, straight-ish leg.
 */

import type { PoseFrame } from '../../../types';
import { midHipY, validPoint, MP, MN17 } from '../lead-low-kick/leadLowKickGeometry';

export const SIDE_KICK_MIN_OUTWARD_FROM_HIP_X = 0.004;
export const SIDE_KICK_MIN_HIP_ANKLE_DX = 0.01;
export const SIDE_KICK_HIP_ANKLE_MIN_LEN = 0.01;

export const SIDE_KICK_MIN_HORIZ_RATIO = 0.4;

export const SIDE_KICK_KNEE_INTERIOR_MIN_DEG = 95;
export const SIDE_KICK_KNEE_INTERIOR_MAX_DEG = 180;
export const SIDE_KICK_ANKLE_MIN_ABOVE_MIDHIP_Y = 0.18;
export const SIDE_KICK_ANKLE_MAX_BELOW_MIDHIP_Y = 0.1;
export const SIDE_KICK_OPPOSITE_FOOT_FULL_SIDEWAYS_RATIO = 0.55;
export const SIDE_KICK_OPPOSITE_FOOT_SIDEWAYS_MIN_ANKLE_DX_FROM_HIP = 0.06;

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

export function inSideKickStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const hip = frame[idx.rh];
  const otherHip = frame[idx.lh];
  const knee = frame[idx.rk];
  const ankle = frame[idx.ra];
  const midHip = midHipY(frame, idx);
  if (!validPoint(hip) || !validPoint(otherHip) || !validPoint(knee) || !validPoint(ankle) || midHip == null) {
    return false;
  }

  // Side kick should stay around hip band (between low and high kick levels).
  if (ankle.y < midHip - SIDE_KICK_ANKLE_MIN_ABOVE_MIDHIP_Y) return false;
  if (ankle.y > midHip + SIDE_KICK_ANKLE_MAX_BELOW_MIDHIP_Y) return false;

  // Right leg must extend outward on its own side (mirror-safe).
  const bodyMidX = (hip.x + otherHip.x) / 2;
  const outwardSign = Math.sign(hip.x - bodyMidX) || 1;
  const outwardDx = (ankle.x - hip.x) * outwardSign;
  if (outwardDx < SIDE_KICK_MIN_OUTWARD_FROM_HIP_X) return false;

  // Must visibly extend sideways.
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const len = Math.hypot(dx, dy);
  if (len < SIDE_KICK_HIP_ANKLE_MIN_LEN) return false;
  if (Math.abs(dx) < SIDE_KICK_MIN_HIP_ANKLE_DX) return false;
  if (Math.abs(dx) < Math.abs(dy) * SIDE_KICK_MIN_HORIZ_RATIO) return false;

  // Straight-ish leg, but not strict.
  const ang = angleDeg(hip, knee, ankle);
  if (!Number.isFinite(ang) || ang < SIDE_KICK_KNEE_INTERIOR_MIN_DEG || ang > SIDE_KICK_KNEE_INTERIOR_MAX_DEG) {
    return false;
  }

  return true;
}

export function inOppositeLegSideKickStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const hip = frame[idx.lh];
  const otherHip = frame[idx.rh];
  const knee = frame[idx.lk];
  const ankle = frame[idx.la];
  const midHip = midHipY(frame, idx);
  if (!validPoint(hip) || !validPoint(otherHip) || !validPoint(knee) || !validPoint(ankle) || midHip == null) {
    return false;
  }

  if (ankle.y < midHip - SIDE_KICK_ANKLE_MIN_ABOVE_MIDHIP_Y) return false;
  if (ankle.y > midHip + SIDE_KICK_ANKLE_MAX_BELOW_MIDHIP_Y) return false;

  const bodyMidX = (hip.x + otherHip.x) / 2;
  const outwardSign = Math.sign(hip.x - bodyMidX) || 1;
  const outwardDx = (ankle.x - hip.x) * outwardSign;
  if (outwardDx < SIDE_KICK_MIN_OUTWARD_FROM_HIP_X) return false;

  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const len = Math.hypot(dx, dy);
  if (len < SIDE_KICK_HIP_ANKLE_MIN_LEN) return false;
  if (Math.abs(dx) < SIDE_KICK_MIN_HIP_ANKLE_DX) return false;
  if (Math.abs(dx) < Math.abs(dy) * SIDE_KICK_MIN_HORIZ_RATIO) return false;

  const ang = angleDeg(hip, knee, ankle);
  return Number.isFinite(ang) && ang >= SIDE_KICK_KNEE_INTERIOR_MIN_DEG && ang <= SIDE_KICK_KNEE_INTERIOR_MAX_DEG;
}

export function oppositeFootFullySideways(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const hip = frame[idx.lh];
  const knee = frame[idx.lk];
  const ankle = frame[idx.la];
  if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle)) return false;
  const dx = Math.abs(ankle.x - knee.x);
  const dy = Math.abs(ankle.y - knee.y);
  if (dy <= 1e-6) return true;
  const ankleDxFromHip = Math.abs(ankle.x - hip.x);
  // Full sideways left/right: clear lateral foot/leg line OR ankle clearly offset from hip.
  return (
    dx >= dy * SIDE_KICK_OPPOSITE_FOOT_FULL_SIDEWAYS_RATIO ||
    ankleDxFromHip >= SIDE_KICK_OPPOSITE_FOOT_SIDEWAYS_MIN_ANKLE_DX_FROM_HIP
  );
}

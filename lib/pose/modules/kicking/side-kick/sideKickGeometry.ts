/**
 * Side kick — **mirror/selfie** convention (same as low/high kicks).
 *
 * Kicking leg = MediaPipe **left** chain (image left ≈ orthodox **rear** leg on a mirrored preview).
 * Strike = leg pushed **out to the left** (ankle left of the hip), mostly sideways, fairly straight.
 * Thresholds are intentionally **lenient** so casual form still registers.
 */

import type { PoseFrame } from '../../../types';
import { midHipY, validPoint, MP, MN17 } from '../lead-low-kick/leadLowKickGeometry';

/** Kicking foot lifted vs support — soft gate. */
export const SIDE_KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y = 0.052;

/** Ankle to the **left** of kicking hip (smaller x) — permissive lateral reach. */
export const SIDE_KICK_ANKLE_MIN_LEFT_OF_HIP_X = 0.032;

/** Hip→ankle reach — short extensions still count. */
export const SIDE_KICK_HIP_ANKLE_MIN_LEN = 0.034;

/** Mostly sideways, but allows more “up” than a strict side kick. */
export const SIDE_KICK_MIN_HORIZ_UNIT = 0.28;

export const SIDE_KICK_MAX_VERTICAL_DOMINANCE = 1.85;

/** Knee may have a noticeable bend; still reads as a side thrust. */
export const SIDE_KICK_KNEE_INTERIOR_MIN_DEG = 120;
export const SIDE_KICK_KNEE_INTERIOR_MAX_DEG = 180;

/** Allow foot a bit below knee line (camera / flex). */
export const SIDE_KICK_ANKLE_MAX_BELOW_KNEE_Y = 0.13;

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

/** Left leg extended **to the side** (image left), support on the right. */
export function inSideKickStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const hip = frame[idx.lh];
  const knee = frame[idx.lk];
  const ankle = frame[idx.la];
  const supportAnkle = frame[idx.ra];
  const line = midHipY(frame, idx);

  if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle) || !validPoint(supportAnkle) || line == null) {
    return false;
  }

  if (ankle.y > knee.y + SIDE_KICK_ANKLE_MAX_BELOW_KNEE_Y) return false;

  if (ankle.x > hip.x - SIDE_KICK_ANKLE_MIN_LEFT_OF_HIP_X) return false;

  if (ankle.y > supportAnkle.y - SIDE_KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y) return false;

  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const len = Math.hypot(dx, dy);
  if (len < SIDE_KICK_HIP_ANKLE_MIN_LEN) return false;

  const horizUnit = Math.abs(dx) / len;
  const vertUnit = Math.abs(dy) / len;
  if (horizUnit < SIDE_KICK_MIN_HORIZ_UNIT) return false;
  if (vertUnit > horizUnit * SIDE_KICK_MAX_VERTICAL_DOMINANCE) return false;

  const ang = angleDeg(hip, knee, ankle);
  if (
    !Number.isFinite(ang) ||
    ang < SIDE_KICK_KNEE_INTERIOR_MIN_DEG ||
    ang > SIDE_KICK_KNEE_INTERIOR_MAX_DEG
  ) {
    return false;
  }

  return true;
}

/**
 * Side kick — left (lead) leg only. Charge = high-knee chamber; good rep = leg extended to the side.
 *
 * MediaPipe y grows downward; support = right ankle. Strike uses strong lateral hip→ankle reach
 * and a fairly straight chain; charge is a lifted knee chamber that does not yet pass strike gates.
 */

import type { PoseFrame } from '../../../types';
import { midHipY, validPoint, MP, MN17 } from '../lead-low-kick/leadLowKickGeometry';

/** Chamber: knee clearly above hip line. */
export const SIDE_KICK_CHARGE_KNEE_MIN_ABOVE_HIP_Y = 0.032;

/** Chamber / transition: kicking foot off the floor vs support. */
export const SIDE_KICK_CHARGE_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y = 0.025;

/** Strike: foot well above planted support ankle. */
export const SIDE_KICK_STRIKE_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y = 0.07;

/** Strike: hip→ankle must extend outward (screen +x ≈ toward camera right). */
export const SIDE_KICK_STRIKE_ANKLE_MIN_FORWARD_OF_HIP_X = 0.07;

export const SIDE_KICK_HIP_ANKLE_MIN_LEN = 0.065;

/** Strike: mostly sideways — |dx|/len. */
export const SIDE_KICK_STRIKE_MIN_HORIZ_UNIT = 0.46;

/** Strike: avoid pure horizontal snap — keep some upward component (hip.y − ankle.y)/len. */
export const SIDE_KICK_STRIKE_MIN_UPWARD_UNIT = 0.12;

export const SIDE_KICK_STRIKE_KNEE_INTERIOR_MIN_DEG = 142;
export const SIDE_KICK_STRIKE_KNEE_INTERIOR_MAX_DEG = 178;

/** Ankle should stay near the top of the chain vs knee (not hanging far below knee). */
export const SIDE_KICK_ANKLE_MAX_BELOW_KNEE_Y = 0.065;

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

/** Full side-kick extension (orthodox lead leg). */
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

  if (ankle.x < hip.x + SIDE_KICK_STRIKE_ANKLE_MIN_FORWARD_OF_HIP_X) return false;

  if (ankle.y > supportAnkle.y - SIDE_KICK_STRIKE_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y) return false;

  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const len = Math.hypot(dx, dy);
  if (len < SIDE_KICK_HIP_ANKLE_MIN_LEN) return false;

  const upwardUnit = (hip.y - ankle.y) / len;
  if (upwardUnit < SIDE_KICK_STRIKE_MIN_UPWARD_UNIT) return false;

  const horizUnit = Math.abs(dx) / len;
  if (horizUnit < SIDE_KICK_STRIKE_MIN_HORIZ_UNIT) return false;

  const ang = angleDeg(hip, knee, ankle);
  if (
    !Number.isFinite(ang) ||
    ang < SIDE_KICK_STRIKE_KNEE_INTERIOR_MIN_DEG ||
    ang > SIDE_KICK_STRIKE_KNEE_INTERIOR_MAX_DEG
  ) {
    return false;
  }

  return true;
}

/**
 * High-knee-style chamber: lifted knee, foot off support, but not yet a full lateral strike.
 */
export function inSideKickChargePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const hip = frame[idx.lh];
  const knee = frame[idx.lk];
  const ankle = frame[idx.la];
  const supportAnkle = frame[idx.ra];

  if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle) || !validPoint(supportAnkle)) {
    return false;
  }

  if (knee.y > hip.y - SIDE_KICK_CHARGE_KNEE_MIN_ABOVE_HIP_Y) return false;

  if (ankle.y > supportAnkle.y - SIDE_KICK_CHARGE_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y) return false;

  if (inSideKickStrikePose(frame, idx)) return false;

  return true;
}

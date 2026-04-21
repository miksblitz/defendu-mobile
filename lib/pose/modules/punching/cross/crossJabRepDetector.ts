/**
 * Cross jab rep detector: user's RIGHT hand punches, user's LEFT hand in guard.
 * App UI: "Your right" = extensionValues.left (MediaPipe left). So punch = MediaPipe LEFT, guard = MediaPipe RIGHT.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 1000;

const MP = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const MN17 = { ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };

function validArmLandmark(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

// Cross jab: user's RIGHT extends = MediaPipe LEFT; user's LEFT in guard = MediaPipe RIGHT
const CROSS_PUNCH_EXTEND_MIN = 0.25;   // punching arm (user's right = MediaPipe left)
const CROSS_PUNCH_RETRACT_MAX = 0.18;
const CROSS_GUARD_MAX = 0.22;          // guard arm (user's left = MediaPipe right)
const CROSS_GUARD_WRIST_UP_TOL = 0.12;
const CROSS_MIN_REP_FRAMES = 5;
const CROSS_HORIZONTAL_Y_TOL = 0.18;
const CROSS_CENTERLINE_MIN = 0.02;
const CROSS_TRAVEL_MIN = 0.08;

function leftExtension(frame: PoseFrame): number | null {
  const d = armExtensionDistances(frame);
  return d ? d.left : null;
}

function rightExtension(frame: PoseFrame): number | null {
  const d = armExtensionDistances(frame);
  return d ? d.right : null;
}

/** User's left hand (guard) = MediaPipe RIGHT (indices 12,14,16): contracted and wrist up. */
function rightHandInGuard(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.rw, idx.re, idx.rs)) return false;
  const rs = frame[idx.rs];
  const re = frame[idx.re];
  const rw = frame[idx.rw];
  if (!validArmLandmark(rs) || !validArmLandmark(re) || !validArmLandmark(rw)) return false;
  const rightDist = Math.sqrt((rw.x - rs.x) ** 2 + (rw.y - rs.y) ** 2);
  const wristUp = rw.y <= re.y + CROSS_GUARD_WRIST_UP_TOL;
  return rightDist <= CROSS_GUARD_MAX && wristUp;
}

function crossDirectionOk(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.rs, idx.lw)) return false;
  const ls = frame[idx.ls];
  const rs = frame[idx.rs];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(rs) || !validArmLandmark(lw)) return false;

  const horizontal = Math.abs(lw.y - ls.y) <= CROSS_HORIZONTAL_Y_TOL;
  const shoulderMidX = (ls.x + rs.x) / 2;
  const towardOppositeSign = Math.sign(rs.x - ls.x) || 1;
  const crossedCenterline = (lw.x - shoulderMidX) * towardOppositeSign >= CROSS_CENTERLINE_MIN;
  const traveledAwayFromPunchShoulder = (lw.x - ls.x) * towardOppositeSign >= CROSS_TRAVEL_MIN;

  return horizontal && crossedCenterline && traveledAwayFromPunchShoulder;
}

/** Cross jab: rep = user's RIGHT extends = MediaPipe LEFT extends; user's LEFT in guard = MediaPipe RIGHT in guard. */
export function createCrossJabRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'extended' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasRetractedSinceRep = false;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      const punch = leftExtension(frame); // user's right = MediaPipe left
      if (punch != null && punch < CROSS_PUNCH_RETRACT_MAX) hasRetractedSinceRep = true;
      if (now >= cooldownUntil && hasRetractedSinceRep) phase = 'idle';
      return { done: false };
    }

    const punch = leftExtension(frame);  // user's right hand = punching = MediaPipe left
    const guard = rightExtension(frame); // user's left hand = guard = MediaPipe right
    if (punch == null) return { done: false };

    if (phase === 'idle') {
      if (punch < CROSS_PUNCH_RETRACT_MAX) hasRetractedSinceRep = true;
      if (
        hasRetractedSinceRep &&
        punch > CROSS_PUNCH_EXTEND_MIN &&
        (guard == null || guard <= CROSS_GUARD_MAX) &&
        rightHandInGuard(frame) &&
        crossDirectionOk(frame)
      ) {
        phase = 'extended';
        segment = [frame];
      }
      return { done: false };
    }
    if (phase === 'extended') {
      segment.push(frame);
      if (
        punch < CROSS_PUNCH_RETRACT_MAX ||
        (guard != null && guard > CROSS_GUARD_MAX) ||
        !rightHandInGuard(frame) ||
        !crossDirectionOk(frame)
      ) {
        phase = 'idle';
        segment = [];
        return { done: false };
      }
      if (segment.length >= CROSS_MIN_REP_FRAMES) {
        const out = [...segment];
        segment = [];
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasRetractedSinceRep = false;
        return { done: true, segment: out };
      }
      return { done: false };
    }
    return { done: false };
  };
}

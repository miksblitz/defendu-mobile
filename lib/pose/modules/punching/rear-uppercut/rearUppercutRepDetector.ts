/**
 * Rear uppercut rep detector: user's RIGHT hand throws the uppercut, user's LEFT hand in guard.
 * Punching arm = MediaPipe LEFT (indices 11, 13, 15). Guard = MediaPipe RIGHT (12, 14, 16).
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

/** User's left hand (guard) = MediaPipe RIGHT: contracted and wrist up. */
function rightHandInGuard(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.rw, idx.re, idx.rs)) return false;
  const rs = frame[idx.rs];
  const re = frame[idx.re];
  const rw = frame[idx.rw];
  if (!validArmLandmark(rs) || !validArmLandmark(re) || !validArmLandmark(rw)) return false;
  const rightDist = Math.sqrt((rw.x - rs.x) ** 2 + (rw.y - rs.y) ** 2);
  const wristUpTol = 0.14;
  const guardMax = 0.26;
  const wristUp = rw.y <= re.y + wristUpTol;
  return rightDist <= guardMax && wristUp;
}

/** Vertical lift for punching arm = MediaPipe LEFT (user's right). */
function punchLift(frame: PoseFrame): number | null {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.lw)) return null;
  const ls = frame[idx.ls];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(lw)) return null;
  return ls.y - lw.y;
}

const UPPERCUT_LIFT_EXTEND_MIN = 0.035;
const UPPERCUT_LIFT_RETRACT_MAX = 0.01;
const UPPERCUT_MIN_REP_FRAMES = 5;

type UppercutState = 'idle' | 'rising' | 'cooldown';

export function createRearUppercutRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: UppercutState = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasDroppedSinceRep = false;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const lift = punchLift(frame);

    if (state === 'cooldown') {
      if (lift != null && lift < UPPERCUT_LIFT_RETRACT_MAX) hasDroppedSinceRep = true;
      if (now >= cooldownUntil && hasDroppedSinceRep) state = 'idle';
      return { done: false };
    }

    if (lift == null) return { done: false };

    if (state === 'idle') {
      if (lift > UPPERCUT_LIFT_EXTEND_MIN && rightHandInGuard(frame)) {
        state = 'rising';
        segment = [frame];
      }
      return { done: false };
    }

    if (state === 'rising') {
      segment.push(frame);
      if (!rightHandInGuard(frame)) {
        state = 'idle';
        segment = [];
        return { done: false };
      }
      if (lift < UPPERCUT_LIFT_RETRACT_MAX) {
        state = 'idle';
        segment = [];
        return { done: false };
      }
      if (segment.length >= UPPERCUT_MIN_REP_FRAMES) {
        const out = [...segment];
        segment = [];
        state = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasDroppedSinceRep = false;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    return { done: false };
  };
}

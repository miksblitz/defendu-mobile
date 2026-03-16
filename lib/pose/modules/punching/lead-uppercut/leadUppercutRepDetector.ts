/**
 * Lead uppercut rep detector: user's LEFT hand throws the uppercut, user's RIGHT hand in guard.
 * Detects a rep when the punching hand travels clearly upward (not just straight forward)
 * while the rear hand stays in guard.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 1000;

// MediaPipe / MoveNet arm landmark indices
const MP = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const MN17 = { ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };

function validArmLandmark(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** User's right hand (guard) = MediaPipe LEFT: contracted and wrist up. */
function leftHandInGuard(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.lw, idx.le, idx.ls)) return false;
  const ls = frame[idx.ls];
  const le = frame[idx.le];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(le) || !validArmLandmark(lw)) return false;
  const leftDist = Math.sqrt((lw.x - ls.x) ** 2 + (lw.y - ls.y) ** 2);
  const wristUpTol = 0.14;
  const guardMax = 0.26;
  const wristUp = lw.y <= le.y + wristUpTol;
  return leftDist <= guardMax && wristUp;
}

/** Vertical lift and extension for the punching arm = MediaPipe RIGHT (user's left). */
function punchMetrics(frame: PoseFrame): { lift: number | null; ext: number | null } {
  const d = armExtensionDistances(frame);
  const ext = d ? d.right : null;
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.rs, idx.rw)) {
    return { lift: null, ext };
  }
  const rs = frame[idx.rs];
  const rw = frame[idx.rw];
  if (!validArmLandmark(rs) || !validArmLandmark(rw)) {
    return { lift: null, ext };
  }
  // Positive when wrist goes above shoulder (uppercut travels upward)
  const lift = rs.y - rw.y;
  return { lift, ext };
}

// Tuned heuristics for uppercut motion
const UPPERCUT_LIFT_EXTEND_MIN = 0.035;   // wrist at impact should be clearly above shoulder
const UPPERCUT_LIFT_RETRACT_MAX = 0.01;   // "down" position: wrist roughly level with or below shoulder
const UPPERCUT_MIN_REP_FRAMES = 5;

type UppercutState = 'idle' | 'rising' | 'cooldown';

/** Lead uppercut: rep when punch lift goes from low to clearly high while guard is maintained. */
export function createLeadUppercutRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: UppercutState = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasDroppedSinceRep = false;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const { lift } = punchMetrics(frame);

    if (state === 'cooldown') {
      // Wait until the punch has dropped back down before counting another rep
      if (lift != null && lift < UPPERCUT_LIFT_RETRACT_MAX) {
        hasDroppedSinceRep = true;
      }
      if (now >= cooldownUntil && hasDroppedSinceRep) {
        state = 'idle';
      }
      return { done: false };
    }

    if (lift == null) {
      return { done: false };
    }

    if (state === 'idle') {
      // Require a clear "down" or neutral start and rear hand in guard
      if (lift < UPPERCUT_LIFT_RETRACT_MAX && leftHandInGuard(frame)) {
        // Wait for lift to rise into the uppercut window
        // Stay in idle until that happens
      }
      if (
        lift > UPPERCUT_LIFT_EXTEND_MIN &&
        leftHandInGuard(frame)
      ) {
        state = 'rising';
        segment = [frame];
      }
      return { done: false };
    }

    if (state === 'rising') {
      segment.push(frame);
      // Guard must be maintained; lift must stay reasonably high
      if (!leftHandInGuard(frame)) {
        state = 'idle';
        segment = [];
        return { done: false };
      }
      if (lift < UPPERCUT_LIFT_RETRACT_MAX) {
        // Dropped too early; restart
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


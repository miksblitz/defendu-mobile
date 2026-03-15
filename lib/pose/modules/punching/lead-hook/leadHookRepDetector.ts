/**
 * Lead hook rep detector: user's LEFT hand throws the hook, user's RIGHT hand in guard.
 * Counts reps when left extends and right in guard.
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

// Lead hook: user's LEFT punches = MediaPipe RIGHT extends; user's RIGHT guard = MediaPipe LEFT in guard
const HOOK_EXTEND_MIN = 0.22;
const HOOK_RETRACT_MAX = 0.18;
const GUARD_MAX = 0.22;
const GUARD_WRIST_UP_TOL = 0.12;
const MIN_REP_FRAMES = 5;

function rightExtension(frame: PoseFrame): number | null {
  const d = armExtensionDistances(frame);
  return d ? d.right : null;
}

function leftExtension(frame: PoseFrame): number | null {
  const d = armExtensionDistances(frame);
  return d ? d.left : null;
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
  const wristUp = lw.y <= le.y + GUARD_WRIST_UP_TOL;
  return leftDist <= GUARD_MAX && wristUp;
}

/** Lead hook: rep = user's LEFT (hook) extends = MediaPipe RIGHT extends; user's RIGHT in guard = MediaPipe LEFT. */
export function createLeadHookRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'extended' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasRetractedSinceRep = false;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      const punch = rightExtension(frame);
      if (punch != null && punch < HOOK_RETRACT_MAX) hasRetractedSinceRep = true;
      if (now >= cooldownUntil && hasRetractedSinceRep) phase = 'idle';
      return { done: false };
    }

    const punch = rightExtension(frame);
    const guard = leftExtension(frame);
    if (punch == null) return { done: false };

    if (phase === 'idle') {
      if (punch < HOOK_RETRACT_MAX) hasRetractedSinceRep = true;
      if (
        hasRetractedSinceRep &&
        punch > HOOK_EXTEND_MIN &&
        (guard == null || guard <= GUARD_MAX) &&
        leftHandInGuard(frame)
      ) {
        phase = 'extended';
        segment = [frame];
      }
      return { done: false };
    }
    if (phase === 'extended') {
      segment.push(frame);
      if (
        punch < HOOK_RETRACT_MAX ||
        (guard != null && guard > GUARD_MAX) ||
        !leftHandInGuard(frame)
      ) {
        phase = 'idle';
        segment = [];
        return { done: false };
      }
      if (segment.length >= MIN_REP_FRAMES) {
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

/**
 * Lead hook rep detector: user's LEFT hand throws the hook, user's RIGHT hand in guard.
 * Counts reps when left extends and right in guard.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';

const COOLDOWN_MS = 1000;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;

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
const HOOK_WRONG_DIRECTION_MIN_STREAK = 2;
const HOOK_ACROSS_CENTERLINE_MIN = 0.0;

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

function leadHookDirectionOk(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.rs, idx.rw)) return false;
  const ls = frame[idx.ls];
  const rs = frame[idx.rs];
  const rw = frame[idx.rw];
  if (!validArmLandmark(ls) || !validArmLandmark(rs) || !validArmLandmark(rw)) return false;
  const shoulderMidX = (ls.x + rs.x) / 2;
  const towardOppositeSign = Math.sign(rs.x - ls.x) || 1;
  return (rw.x - shoulderMidX) * towardOppositeSign >= HOOK_ACROSS_CENTERLINE_MIN;
}

/** Lead hook: rep = user's LEFT (hook) extends = MediaPipe RIGHT extends; user's RIGHT in guard = MediaPipe LEFT. */
export function createLeadHookRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'extended' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasRetractedSinceRep = false;
  let rightFacingBadUntil = 0;
  let wrongDirectionStreak = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      phase = 'idle';
      segment = [];
      hasRetractedSinceRep = false;
      wrongDirectionStreak = 0;
      return buildFacingRightBadRep(frame, 'lead-hook-facing-right-bad-rep');
    }

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
      const wrongDirection =
        hasRetractedSinceRep &&
        punch > HOOK_EXTEND_MIN &&
        (guard == null || guard <= GUARD_MAX) &&
        leftHandInGuard(frame) &&
        !leadHookDirectionOk(frame);
      wrongDirectionStreak = wrongDirection ? wrongDirectionStreak + 1 : 0;
      if (wrongDirectionStreak >= HOOK_WRONG_DIRECTION_MIN_STREAK) {
        const out = [frame];
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasRetractedSinceRep = false;
        wrongDirectionStreak = 0;
        return {
          done: true,
          segment: out,
          forcedBadRep: true,
          feedback: [{
            id: 'lead-hook-wrong-direction-bad-rep',
            message: 'WRONG DIRECTION!',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }
      if (
        hasRetractedSinceRep &&
        punch > HOOK_EXTEND_MIN &&
        (guard == null || guard <= GUARD_MAX) &&
        leftHandInGuard(frame) &&
        leadHookDirectionOk(frame)
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
        !leftHandInGuard(frame) ||
        !leadHookDirectionOk(frame)
      ) {
        phase = 'idle';
        segment = [];
        wrongDirectionStreak = 0;
        return { done: false };
      }
      if (segment.length >= MIN_REP_FRAMES) {
        const out = [...segment];
        segment = [];
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasRetractedSinceRep = false;
        wrongDirectionStreak = 0;
        return { done: true, segment: out };
      }
      return { done: false };
    }
    return { done: false };
  };
}

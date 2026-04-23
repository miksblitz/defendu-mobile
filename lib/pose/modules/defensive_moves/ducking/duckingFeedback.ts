/**
 * Ducking feedback:
 * - checks enough down movement (standing -> ducking)
 * - checks both hands stay in guard while ducking
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const MP = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const DUCK_MIN_DELTA_Y = 0.04;
const MAX_GUARD_EXTENSION = 0.36;
const WRIST_UP_TOL = 0.1;

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function shoulderMidY(frame: PoseFrame): number | null {
  if (frame.length <= MP.rs) return null;
  const ls = frame[MP.ls];
  const rs = frame[MP.rs];
  if (!validPoint(ls) || !validPoint(rs)) return null;
  return (ls.y + rs.y) / 2;
}

function guardOk(frame: PoseFrame): boolean {
  const d = armExtensionDistances(frame);
  if (!d || frame.length <= MP.rw) return false;
  const le = frame[MP.le];
  const re = frame[MP.re];
  const lw = frame[MP.lw];
  const rw = frame[MP.rw];
  if (!validPoint(le) || !validPoint(re) || !validPoint(lw) || !validPoint(rw)) return false;
  const leftWristUp = lw.y <= le.y + WRIST_UP_TOL;
  const rightWristUp = rw.y <= re.y + WRIST_UP_TOL;
  const leftCompact = d.left <= MAX_GUARD_EXTENSION;
  const rightCompact = d.right <= MAX_GUARD_EXTENSION;
  return leftWristUp && rightWristUp && leftCompact && rightCompact;
}

export function getDuckingFeedback(userFrames: PoseFrame[], _referenceFrames: PoseFrame[] | null): PoseFeedbackItem[] {
  if (userFrames.length < 2) return [];
  const startY = shoulderMidY(userFrames[0]!);
  const downY = shoulderMidY(userFrames[Math.floor(userFrames.length * 0.75)] ?? userFrames[userFrames.length - 1]!);
  if (startY == null || downY == null) return [];

  const out: PoseFeedbackItem[] = [];
  const downDelta = downY - startY;
  if (downDelta < DUCK_MIN_DELTA_Y) {
    out.push({
      id: 'duck-not-low-enough',
      message: 'Duck lower (clear down movement from standing position)',
      phase: 'impact',
      severity: 'error',
    });
  }

  const downFrame = userFrames[Math.floor(userFrames.length * 0.75)] ?? userFrames[userFrames.length - 1]!;
  if (!guardOk(downFrame)) {
    out.push({
      id: 'guard-not-up-while-ducking',
      message: 'Keep both hands in guard while ducking',
      phase: 'impact',
      severity: 'error',
    });
  }

  return out;
}

export function isDuckingFormAcceptable(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getDuckingFeedback(userFrames, referenceFrames);
  const errors = feedback.filter((f) => f.severity === 'error').length;
  return { acceptable: errors <= 0, feedback };
}

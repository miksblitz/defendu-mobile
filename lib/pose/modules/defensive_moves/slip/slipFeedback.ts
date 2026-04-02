/**
 * Slip feedback:
 * - Upper body should move off centerline (left or right)
 * - Hips should stay relatively centered/stable
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';

const MP = { ls: 11, rs: 12, lh: 23, rh: 24 };
const SLIP_OFFSET_MIN = 0.075;
const MAX_HIP_DRIFT = 0.04;

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function getCenters(frame: PoseFrame): { torsoX: number; hipX: number } | null {
  if (frame.length <= MP.rh) return null;
  const ls = frame[MP.ls];
  const rs = frame[MP.rs];
  const lh = frame[MP.lh];
  const rh = frame[MP.rh];
  if (!validPoint(ls) || !validPoint(rs) || !validPoint(lh) || !validPoint(rh)) return null;
  return {
    torsoX: (ls.x + rs.x) / 2,
    hipX: (lh.x + rh.x) / 2,
  };
}

export function getSlipFeedback(userFrames: PoseFrame[], _referenceFrames: PoseFrame[] | null): PoseFeedbackItem[] {
  if (userFrames.length === 0) return [];
  const first = getCenters(userFrames[0]!);
  const mid = getCenters(userFrames[Math.floor(userFrames.length * 0.6)] ?? userFrames[userFrames.length - 1]!);
  if (!first || !mid) return [];

  const offset = mid.torsoX - mid.hipX;
  const absOffset = Math.abs(offset);
  const hipDrift = Math.abs(mid.hipX - first.hipX);
  const out: PoseFeedbackItem[] = [];

  if (absOffset < SLIP_OFFSET_MIN) {
    out.push({
      id: 'slip-not-far-enough',
      message: 'Move your upper body farther off the center line',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (hipDrift > MAX_HIP_DRIFT) {
    out.push({
      id: 'hips-moving-too-much',
      message: 'Keep your hips/core stable; move mainly your upper body',
      phase: 'impact',
      severity: 'error',
    });
  }

  return out;
}

const SLIP_ERROR_IDS = ['slip-not-far-enough', 'hips-moving-too-much'];

export function isSlipFormAcceptable(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getSlipFeedback(userFrames, referenceFrames);
  const errors = feedback.filter((f) => f.severity === 'error' && SLIP_ERROR_IDS.includes(f.id)).length;
  return { acceptable: errors <= 0, feedback };
}

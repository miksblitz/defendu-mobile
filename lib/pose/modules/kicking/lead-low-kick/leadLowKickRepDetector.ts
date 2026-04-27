/**
 * Lead low kick — rep detector.
 *
 * Strike pose and “feet neutral” never occur on the same frame: during extension the kicking
 * ankle stays well above the support ankle. Idle entry uses either a rising edge on strike
 * or a transition from reset, and cooldown ends on a timer only (see jab pattern).
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import {
  getIdx,
  inLeadLowKickStrikePose,
  inRearLowKickStrikePose,
  leadLowKickResetPose,
} from './leadLowKickGeometry';

const COOLDOWN_MS = 700;
const MIN_REP_FRAMES = 3;
const LEAD_KICK_SAME_SIDE_CENTERLINE_MIN = 0.01;

function leadKickSameSide(frame: PoseFrame, idx: ReturnType<typeof getIdx>): boolean {
  if (!idx) return false;
  const lh = frame[idx.lh];
  const rh = frame[idx.rh];
  const ra = frame[idx.ra]; // lead low kick uses right-chain ankle
  if (!lh || !rh || !ra) return false;
  if (![lh.x, rh.x, ra.x].every(Number.isFinite)) return false;

  const bodyMidX = (lh.x + rh.x) / 2;
  const sameSideSign = Math.sign(rh.x - lh.x) || 1;
  // Lead kick must remain on its own side (no across-body kick).
  return (ra.x - bodyMidX) * sameSideSign >= LEAD_KICK_SAME_SIDE_CENTERLINE_MIN;
}

export function createLeadLowKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'striking' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let prevStrike = false;
  let prevReset = false;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const idx = getIdx(frame);
    if (!idx) return { done: false };

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      phase = 'idle';
      segment = [];
      prevStrike = inLeadLowKickStrikePose(frame, idx);
      prevReset = leadLowKickResetPose(frame, idx);
      return { done: false };
    }

    const strike = inLeadLowKickStrikePose(frame, idx) && leadKickSameSide(frame, idx);
    const oppositeLegStrike = inRearLowKickStrikePose(frame, idx);
    const reset = leadLowKickResetPose(frame, idx);

    if (oppositeLegStrike && !strike) {
      phase = 'cooldown';
      segment = [];
      cooldownUntil = now + COOLDOWN_MS;
      prevStrike = false;
      prevReset = reset;
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'lead-low-kick-opposite-leg',
          message: 'Bad Repetition — use your lead leg for this low kick.',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (phase === 'idle') {
      if (strike && (!prevStrike || prevReset)) {
        phase = 'striking';
        segment = [frame];
      }
      prevStrike = strike;
      prevReset = reset;
      return { done: false };
    }

    if (!strike) {
      phase = 'idle';
      segment = [];
      prevStrike = false;
      prevReset = reset;
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

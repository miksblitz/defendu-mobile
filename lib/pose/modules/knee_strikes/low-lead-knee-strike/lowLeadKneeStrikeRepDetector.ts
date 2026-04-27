/**
 * Low lead knee strike — rep detector.
 *
 * Right knee must stay on or below the mid-hip line (see geometry) with a bent knee — not a straight leg.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import {
  getIdx,
  inLowLeadStrikePose,
  lowLeadResetPose,
} from './lowLeadKneeStrikeGeometry';
import { inLowRearStrikePose } from '../low-rear-knee-strike/lowRearKneeStrikeGeometry';

const COOLDOWN_MS = 650;
const MIN_REP_FRAMES = 3;

export function createLowLeadKneeStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'raised' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let armed = false;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const idx = getIdx(frame);
    if (!idx) return { done: false };

    const strike = inLowLeadStrikePose(frame, idx);
    const oppositeLegStrike = inLowRearStrikePose(frame, idx);
    const reset = lowLeadResetPose(frame, idx);

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      phase = 'idle';
      segment = [];
    }

    if (oppositeLegStrike && !strike) {
      phase = 'cooldown';
      segment = [];
      cooldownUntil = now + COOLDOWN_MS;
      armed = false;
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'low-lead-knee-opposite-leg',
          message: 'Bad Repetition — use your lead leg for this low knee strike.',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (phase === 'idle') {
      // Re-arm only after a true planted reset frame where strike is not active.
      if (!strike && reset) armed = true;
      if (!armed || !strike) return { done: false };
      phase = 'raised';
      segment = [frame];
      armed = false;
      return { done: false };
    }

    if (!strike) {
      phase = 'idle';
      segment = [];
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      armed = false;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

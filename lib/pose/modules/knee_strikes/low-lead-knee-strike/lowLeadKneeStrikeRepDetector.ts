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
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';

const COOLDOWN_MS = 650;
const MIN_REP_FRAMES = 3;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;

export function createLowLeadKneeStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'raised' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let armed = false;
  let rightFacingBadUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      phase = 'cooldown';
      segment = [];
      cooldownUntil = now + COOLDOWN_MS;
      armed = false;
      return buildFacingRightBadRep(frame, 'low-lead-knee-facing-right-bad-rep');
    }

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
          message: 'WRONG KNEE!',
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

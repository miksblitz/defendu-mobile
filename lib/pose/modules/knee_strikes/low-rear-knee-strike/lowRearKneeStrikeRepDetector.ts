/**
 * Low rear knee strike — rep detector.
 *
 * Left knee on or below mid-hip line with a bent knee (mirror of low lead on the right).
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import {
  getIdx,
  inLowRearStrikePose,
  lowRearResetPose,
} from './lowRearKneeStrikeGeometry';
import { inLowLeadStrikePose } from '../low-lead-knee-strike/lowLeadKneeStrikeGeometry';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';

const COOLDOWN_MS = 650;
const MIN_REP_FRAMES = 3;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;

export function createLowRearKneeStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
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
      return buildFacingRightBadRep(frame, 'low-rear-knee-facing-right-bad-rep');
    }

    const idx = getIdx(frame);
    if (!idx) return { done: false };

    const strike = inLowRearStrikePose(frame, idx);
    const oppositeLegStrike = inLowLeadStrikePose(frame, idx);
    const reset = lowRearResetPose(frame, idx);

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
          id: 'low-rear-knee-opposite-leg',
          message: 'WRONG KNEE!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (phase === 'idle') {
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

/**
 * Side kick — require charge (chamber) then lateral extension for a rep.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { getIdx, leadLowKickResetPose } from '../lead-low-kick/leadLowKickGeometry';
import { inSideKickChargePose, inSideKickStrikePose } from './sideKickGeometry';

const COOLDOWN_MS = 750;
const MIN_REP_FRAMES = 3;
const MIN_CHARGE_FRAMES = 2;
const ARMED_TIMEOUT_MS = 2800;

type Phase = 'idle' | 'armed' | 'striking' | 'cooldown';

export function createSideKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: Phase = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let chargeStreak = 0;
  let armedUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const idx = getIdx(frame);
    if (!idx) return { done: false };

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      phase = 'idle';
      segment = [];
      chargeStreak = 0;
      armedUntil = 0;
      return { done: false };
    }

    const strike = inSideKickStrikePose(frame, idx);
    const charge = inSideKickChargePose(frame, idx);
    const reset = leadLowKickResetPose(frame, idx);

    if (phase === 'idle') {
      if (charge) {
        chargeStreak += 1;
        if (chargeStreak >= MIN_CHARGE_FRAMES) {
          phase = 'armed';
          armedUntil = now + ARMED_TIMEOUT_MS;
          chargeStreak = 0;
        }
      } else {
        chargeStreak = 0;
      }
      return { done: false };
    }

    if (phase === 'armed') {
      if (now > armedUntil) {
        phase = 'idle';
        chargeStreak = 0;
        armedUntil = 0;
        return { done: false };
      }

      if (reset && !charge && !strike) {
        phase = 'idle';
        chargeStreak = 0;
        armedUntil = 0;
        return { done: false };
      }

      if (strike) {
        phase = 'striking';
        segment = [frame];
        return { done: false };
      }

      return { done: false };
    }

    // striking
    if (!strike) {
      phase = 'idle';
      segment = [];
      chargeStreak = 0;
      armedUntil = 0;
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      chargeStreak = 0;
      armedUntil = 0;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

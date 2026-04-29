/**
 * Side kick — low-kick style rep detector with explicit reset gating.
 * After each rep, both feet must return to planted/reset for a few frames.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';
import { getIdx, leadLowKickResetPose } from '../lead-low-kick/leadLowKickGeometry';
import { inOppositeLegSideKickStrikePose, inSideKickStrikePose, oppositeFootFullySideways } from './sideKickGeometry';

const COOLDOWN_MS = 700;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
const FOOT_SIDEWAYS_SPAM_COOLDOWN_MS = 220;
const MIN_REP_FRAMES = 2;
const MIN_PLANTED_STREAK = 3;

export function createSideKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'striking' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let prevStrike = false;
  let prevReset = false;
  let needsReplantAfterRep = false;
  let plantedStreak = 0;
  let rightFacingBadUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      phase = 'idle';
      segment = [];
      prevStrike = false;
      prevReset = false;
      needsReplantAfterRep = false;
      plantedStreak = 0;
      return buildFacingRightBadRep(frame, 'side-kick-facing-right-bad-rep');
    }

    const idx = getIdx(frame);
    if (!idx) return { done: false };

    const strike = inSideKickStrikePose(frame, idx);
    const oppositeLegStrike = inOppositeLegSideKickStrikePose(frame, idx);
    const oppositeFootSideways = oppositeFootFullySideways(frame, idx);
    const reset = leadLowKickResetPose(frame, idx);

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      phase = 'idle';
      segment = [];
      prevStrike = strike;
      prevReset = reset;
      plantedStreak = 0;
      return { done: false };
    }

    if (oppositeFootSideways) {
      phase = 'cooldown';
      segment = [];
      cooldownUntil = now + FOOT_SIDEWAYS_SPAM_COOLDOWN_MS;
      prevStrike = false;
      prevReset = reset;
      needsReplantAfterRep = false;
      plantedStreak = 0;
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'side-kick-opposite-foot-sideways',
          message: 'KEEP FOOT FRONT!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (oppositeLegStrike && !strike) {
      phase = 'cooldown';
      segment = [];
      cooldownUntil = now + COOLDOWN_MS;
      prevStrike = false;
      prevReset = reset;
      needsReplantAfterRep = false;
      plantedStreak = 0;
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'side-kick-opposite-leg',
          message: 'WRONG LEG!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (phase === 'idle') {
      if (needsReplantAfterRep) {
        plantedStreak = reset ? plantedStreak + 1 : 0;
        if (plantedStreak >= MIN_PLANTED_STREAK) {
          needsReplantAfterRep = false;
          plantedStreak = 0;
        }
      } else {
        plantedStreak = 0;
      }

      const replantOk = !needsReplantAfterRep;
      if (replantOk && strike && (!prevStrike || prevReset)) {
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
      needsReplantAfterRep = true;
      plantedStreak = 0;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

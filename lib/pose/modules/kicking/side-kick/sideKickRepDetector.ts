/**
 * Side kick — rep detector with reset gating after each good rep.
 * Before the next rep can arm, the kicking leg must leave the strike line: either **rechamber**
 * (knee bent back — foot may stay off the floor) **or** a full planted low-kick reset, held a few frames.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';
import { getIdx } from '../lead-low-kick/leadLowKickGeometry';
import {
  inOppositeLegSideKickStrikePose,
  inSideKickStrikePose,
  oppositeFootFullySideways,
  sideKickReadyForNextRep,
} from './sideKickGeometry';

const COOLDOWN_MS = 700;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
const FOOT_SIDEWAYS_SPAM_COOLDOWN_MS = 220;
/** Require a short visible strike segment so pose noise does not double-count. */
const MIN_REP_FRAMES = 4;
/** Consecutive frames of rechamber or planted reset before arming the next strike. */
const MIN_READY_STREAK = 4;

export function createSideKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'striking' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let prevStrike = false;
  let prevReset = false;
  let needsResetAfterRep = false;
  let readyStreak = 0;
  let rightFacingBadUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      phase = 'idle';
      segment = [];
      prevStrike = false;
      prevReset = false;
      needsResetAfterRep = false;
      readyStreak = 0;
      return buildFacingRightBadRep(frame, 'side-kick-facing-right-bad-rep');
    }

    const idx = getIdx(frame);
    if (!idx) return { done: false };

    const strike = inSideKickStrikePose(frame, idx);
    const oppositeLegStrike = inOppositeLegSideKickStrikePose(frame, idx);
    const oppositeFootSideways = oppositeFootFullySideways(frame, idx);
    const readyForNext = sideKickReadyForNextRep(frame, idx);

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      phase = 'idle';
      segment = [];
      prevStrike = strike;
      prevReset = readyForNext;
      readyStreak = 0;
      return { done: false };
    }

    if (oppositeFootSideways) {
      phase = 'cooldown';
      segment = [];
      cooldownUntil = now + FOOT_SIDEWAYS_SPAM_COOLDOWN_MS;
      prevStrike = false;
      prevReset = readyForNext;
      needsResetAfterRep = false;
      readyStreak = 0;
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
      prevReset = readyForNext;
      needsResetAfterRep = false;
      readyStreak = 0;
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
      if (needsResetAfterRep) {
        readyStreak = readyForNext ? readyStreak + 1 : 0;
        if (readyStreak >= MIN_READY_STREAK) {
          needsResetAfterRep = false;
          readyStreak = 0;
        }
      } else {
        readyStreak = 0;
      }

      const resetGateOk = !needsResetAfterRep;
      if (resetGateOk && strike && (!prevStrike || prevReset)) {
        phase = 'striking';
        segment = [frame];
      }

      prevStrike = strike;
      prevReset = readyForNext;
      return { done: false };
    }

    if (!strike) {
      phase = 'idle';
      segment = [];
      prevStrike = false;
      prevReset = readyForNext;
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      needsResetAfterRep = true;
      readyStreak = 0;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

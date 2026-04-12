/**
 * Side kick — cooldown after each counted rep, and both feet must be **planted** (neutral stance)
 * for several consecutive frames before another rep can start, so the counter cannot spam.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { getIdx, leadLowKickResetPose } from '../lead-low-kick/leadLowKickGeometry';
import { inSideKickStrikePose } from './sideKickGeometry';

/** Minimum time after a finished rep before strike logic can count again. */
const COOLDOWN_MS = 1000;

const MIN_REP_FRAMES = 3;

/** Consecutive “feet down / neutral” frames required after a rep before the next kick can register. */
const MIN_PLANTED_STREAK = 5;

export function createSideKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'striking' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let prevStrike = false;
  let prevReset = false;
  /** After a completed rep: true until we see a solid planted streak in idle. */
  let needsReplantAfterRep = false;
  let plantedStreak = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const idx = getIdx(frame);
    if (!idx) return { done: false };

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      phase = 'idle';
      segment = [];
      prevStrike = inSideKickStrikePose(frame, idx);
      prevReset = leadLowKickResetPose(frame, idx);
      plantedStreak = 0;
      return { done: false };
    }

    const strike = inSideKickStrikePose(frame, idx);
    const reset = leadLowKickResetPose(frame, idx);

    if (phase === 'idle') {
      if (needsReplantAfterRep) {
        if (reset) plantedStreak += 1;
        else plantedStreak = 0;
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

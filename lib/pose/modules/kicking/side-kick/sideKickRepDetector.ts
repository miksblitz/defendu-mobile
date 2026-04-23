/**
 * Side kick — low-kick style rep detector with explicit reset gating.
 * After each rep, both feet must return to planted/reset for a few frames.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { getIdx, leadLowKickResetPose } from '../lead-low-kick/leadLowKickGeometry';
import { inSideKickStrikePose } from './sideKickGeometry';

const COOLDOWN_MS = 700;
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

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const idx = getIdx(frame);
    if (!idx) return { done: false };

    const strike = inSideKickStrikePose(frame, idx);
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

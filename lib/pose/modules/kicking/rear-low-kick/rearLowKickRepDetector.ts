/**
 * Rear low kick — rep detector (MP left chain / mirrored rear leg; same state machine as lead).
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { getIdx, inRearLowKickStrikePose, leadLowKickResetPose } from '../lead-low-kick/leadLowKickGeometry';

const COOLDOWN_MS = 700;
const MIN_REP_FRAMES = 3;

export function createRearLowKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
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
      prevStrike = inRearLowKickStrikePose(frame, idx);
      prevReset = leadLowKickResetPose(frame, idx);
      return { done: false };
    }

    const strike = inRearLowKickStrikePose(frame, idx);
    const reset = leadLowKickResetPose(frame, idx);

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

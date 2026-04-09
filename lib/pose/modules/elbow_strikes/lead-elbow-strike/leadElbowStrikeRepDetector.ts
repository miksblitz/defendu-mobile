import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { getLeadArmSnapshot, isLeadElbowFinalPose } from './leadElbowStrikeFormRules';

const MIN_HOLD_FRAMES = 1;
const MIN_RETRACT_FRAMES = 2;
const COOLDOWN_MS = 450;

type State = 'idle' | 'holding' | 'cooldown';

export function createLeadElbowStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: State = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let retractFrames = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const snap = getLeadArmSnapshot(frame);
    const finalPose = isLeadElbowFinalPose(snap, false);

    if (state === 'cooldown') {
      if (!finalPose) retractFrames = Math.min(retractFrames + 1, MIN_RETRACT_FRAMES);
      else retractFrames = 0;
      if (now >= cooldownUntil && retractFrames >= MIN_RETRACT_FRAMES) {
        state = 'idle';
        segment = [];
        retractFrames = 0;
      }
      return { done: false };
    }

    if (!finalPose) {
      state = 'idle';
      segment = [];
      return { done: false };
    }

    if (state === 'idle') {
      state = 'holding';
      segment = [frame];
      if (segment.length >= MIN_HOLD_FRAMES) {
        const out = [...segment];
        segment = [];
        state = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        retractFrames = 0;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_HOLD_FRAMES) {
      const out = [...segment];
      segment = [];
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      retractFrames = 0;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

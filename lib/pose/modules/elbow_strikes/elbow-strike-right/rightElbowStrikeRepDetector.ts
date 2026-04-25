import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { getRightElbowStrikeArmSnapshot, isRightElbowStrikeFinalPose } from './rightElbowStrikeFormRules';
import { getLeadArmSnapshot, isLeadElbowFinalPose } from '../lead-elbow-strike/leadElbowStrikeFormRules';
import { armExtensionDistances } from '../../../phaseDetection';

const MIN_HOLD_FRAMES = 1;
const MIN_RETRACT_FRAMES = 2;
const COOLDOWN_MS = 2000;
const GUARD_MAX_EXTENSION = 0.24;

type State = 'idle' | 'holding' | 'cooldown';

function isGuardResetFrame(frame: PoseFrame): boolean {
  const d = armExtensionDistances(frame);
  if (!d) return false;
  return d.left <= GUARD_MAX_EXTENSION && d.right <= GUARD_MAX_EXTENSION;
}

export function createRightElbowStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: State = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let retractFrames = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const snap = getRightElbowStrikeArmSnapshot(frame);
    const finalPose = isRightElbowStrikeFinalPose(snap, false);
    const oppositeSnap = getLeadArmSnapshot(frame);
    const oppositeFinalPose = isLeadElbowFinalPose(oppositeSnap, false);

    if (oppositeFinalPose && !finalPose) {
      state = 'idle';
      segment = [];
      retractFrames = 0;
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'wrong-elbow-strike-arm',
          message: 'Bad Repetition — use your right elbow for this strike.',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (state === 'cooldown') {
      if (!finalPose && isGuardResetFrame(frame)) retractFrames = Math.min(retractFrames + 1, MIN_RETRACT_FRAMES);
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

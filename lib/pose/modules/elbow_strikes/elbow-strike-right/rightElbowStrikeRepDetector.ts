import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { getRightElbowStrikeArmSnapshot, isRightElbowStrikeFinalPose } from './rightElbowStrikeFormRules';
import { getLeadArmSnapshot, isLeadElbowFinalPose } from '../lead-elbow-strike/leadElbowStrikeFormRules';
import { armExtensionDistances } from '../../../phaseDetection';

const MIN_HOLD_FRAMES = 1;
const MIN_RETRACT_FRAMES = 2;
// Mirrors the jab module's cooldown (see jabRepDetector.ts COOLDOWN_MS = 1000):
// 1s after a perfect rep before the next one can be counted.
const COOLDOWN_MS = 1000;
const GUARD_MAX_EXTENSION = 0.24;
// Debounce so the wrong-arm bad rep doesn't fire every frame while the user
// is held in the offending pose.
const BAD_REP_COOLDOWN_MS = 600;

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
  let badRepCooldownUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const snap = getRightElbowStrikeArmSnapshot(frame);
    const finalPose = isRightElbowStrikeFinalPose(snap, false);
    // Wrong-arm detection uses the SAME relaxed angle/lateral/far-distance
    // rules as the perfect rep, applied to the opposite (lead) arm landmarks.
    const oppositeSnap = getLeadArmSnapshot(frame);
    const oppositeFinalPose = isLeadElbowFinalPose(oppositeSnap, false);

    if (oppositeFinalPose && !finalPose && now >= badRepCooldownUntil) {
      badRepCooldownUntil = now + BAD_REP_COOLDOWN_MS;
      state = 'idle';
      segment = [];
      retractFrames = 0;
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'wrong-elbow-strike-arm',
          message: 'WRONG ARM!',
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

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import {
  getRightElbowStrikeArmSnapshot,
  isRightElbowStrikeFinalPose,
} from '../elbow-strike-right/rightElbowStrikeFormRules';
import {
  getBackwardsElbowStrikeSnapshot,
  isBackwardsElbowStrikeFinalPose,
  MAX_ELBOW_FRONT_X,
} from './backwardsElbowStrikeFormRules';

const MIN_HOLD_FRAMES = 1;
const MIN_RETRACT_FRAMES = 2;
const COOLDOWN_MS = 450;
const RIGHT_FACING_BAD_COOLDOWN_MS = 180;
const FORWARD_BAD_MIN_LIFT = 0.08;
const OPPOSITE_UPPERCUT_MIN_LIFT = 0.2;
const OPPOSITE_UPPERCUT_MAX_WRIST_ABOVE_ELBOW = -0.12;

type State = 'idle' | 'holding' | 'cooldown';

function isForwardElbowAttempt(frame: PoseFrame): boolean {
  const snap = getBackwardsElbowStrikeSnapshot(frame);
  if (!snap) return false;
  return snap.elbowBackX <= MAX_ELBOW_FRONT_X && snap.elbowLift >= FORWARD_BAD_MIN_LIFT;
}

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function oppositeUppercutElbowMotion(frame: PoseFrame): boolean {
  const pick = frame.length > 17 ? { sh: 12, el: 14, wr: 16 } : { sh: 6, el: 8, wr: 10 };
  if (frame.length <= Math.max(pick.sh, pick.el, pick.wr)) return false;
  const shoulder = frame[pick.sh];
  const elbow = frame[pick.el];
  const wrist = frame[pick.wr];
  if (!validPoint(shoulder) || !validPoint(elbow) || !validPoint(wrist)) return false;
  const elbowLift = shoulder.y - elbow.y;
  const wristAboveElbow = elbow.y - wrist.y;
  return elbowLift >= OPPOSITE_UPPERCUT_MIN_LIFT && wristAboveElbow <= OPPOSITE_UPPERCUT_MAX_WRIST_ABOVE_ELBOW;
}

function isFacingRightSide(frame: PoseFrame): boolean {
  const pick = frame.length > 17
    ? { nose: 0, ls: 11, rs: 12 }
    : { nose: 0, ls: 5, rs: 6 };
  if (frame.length <= Math.max(pick.nose, pick.ls, pick.rs)) return false;
  const nose = frame[pick.nose];
  const leftShoulder = frame[pick.ls];
  const rightShoulder = frame[pick.rs];
  if (!validPoint(nose) || !validPoint(leftShoulder) || !validPoint(rightShoulder)) return false;

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const RIGHT_FACING_NOSE_OFFSET = 0.015;
  return nose.x > shoulderMidX + RIGHT_FACING_NOSE_OFFSET;
}

export function createBackwardsElbowStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: State = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let retractFrames = 0;
  let rightFacingBadUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const facingRight = isFacingRightSide(frame);
    const snap = getBackwardsElbowStrikeSnapshot(frame);
    const finalPose = isBackwardsElbowStrikeFinalPose(snap);
    const forwardAttempt = isForwardElbowAttempt(frame);
    const oppositeElbowStrike = isRightElbowStrikeFinalPose(getRightElbowStrikeArmSnapshot(frame), false);
    const oppositeUppercut = oppositeUppercutElbowMotion(frame);

    if (facingRight && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      state = 'idle';
      segment = [];
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'backwards-elbow-facing-right',
          message: 'FACE LEFT!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

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

    if (forwardAttempt && !finalPose) {
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      retractFrames = 0;
      segment = [];
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'backwards-elbow-forward-strike',
          message: 'WRONG DIRECTION!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if ((oppositeElbowStrike || oppositeUppercut) && !finalPose) {
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      retractFrames = 0;
      segment = [];
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'backwards-elbow-opposite-hand',
          message: 'WRONG ARM!',
          severity: 'error',
          phase: 'impact',
        }],
      };
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

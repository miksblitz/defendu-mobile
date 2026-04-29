/**
 * Parry form feedback:
 * either arm is accepted as the active parry arm.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const MP = { ls: 11, rs: 12, lw: 15, rw: 16 };
const PARRY_MIN_EXTENSION = 0.26;
const PARRY_MIN_LATERAL = 0.065;
const MIN_LATERAL_SHOULDER_RATIO = 0.5;
const WRIST_ABOVE_SHOULDER_MIN = 0.005;

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

type ArmScore = { side: 'left' | 'right'; extension: number; lateral: number; wristAbove: number };

function lateralThreshold(frame: PoseFrame, side: 'left' | 'right'): number {
  const shoulder = side === 'left' ? frame[MP.ls] : frame[MP.rs];
  const otherShoulder = side === 'left' ? frame[MP.rs] : frame[MP.ls];
  if (!validPoint(shoulder) || !validPoint(otherShoulder)) return PARRY_MIN_LATERAL;
  const shoulderWidth = Math.abs(otherShoulder.x - shoulder.x);
  return Math.min(PARRY_MIN_LATERAL, shoulderWidth * MIN_LATERAL_SHOULDER_RATIO);
}

function armScore(frame: PoseFrame, side: 'left' | 'right'): ArmScore | null {
  if (frame.length <= MP.rw) return null;
  const d = armExtensionDistances(frame);
  if (!d) return null;
  const shoulder = side === 'left' ? frame[MP.ls] : frame[MP.rs];
  const wrist = side === 'left' ? frame[MP.lw] : frame[MP.rw];
  if (!validPoint(shoulder) || !validPoint(wrist)) return null;
  return {
    side,
    extension: side === 'left' ? d.left : d.right,
    lateral: Math.abs(wrist.x - shoulder.x),
    wristAbove: shoulder.y - wrist.y,
  };
}

export function getParryFeedback(userFrames: PoseFrame[], _referenceFrames: PoseFrame[] | null): PoseFeedbackItem[] {
  if (userFrames.length === 0) return [];
  const f = userFrames[Math.floor(userFrames.length * 0.6)] ?? userFrames[userFrames.length - 1]!;
  const left = armScore(f, 'left');
  const right = armScore(f, 'right');
  if (!left && !right) return [];

  const best = !left ? right! : !right ? left : left.extension >= right.extension ? left : right;
  const out: PoseFeedbackItem[] = [];

  if (best.extension < PARRY_MIN_EXTENSION) {
    out.push({
      id: 'parry-arm-not-extended',
      message: 'Extend either arm more during the parry',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (best.lateral < lateralThreshold(f, best.side)) {
    out.push({
      id: 'parry-not-wide-enough',
      message: 'Move the parry arm more to the side',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (best.wristAbove < WRIST_ABOVE_SHOULDER_MIN) {
    out.push({
      id: 'parry-hand-too-low',
      message: 'Keep the parry hand higher than the shoulder line',
      phase: 'impact',
      severity: 'error',
    });
  }

  return out;
}

function pickBestArm(frame: PoseFrame): ArmScore | null {
  const left = armScore(frame, 'left');
  const right = armScore(frame, 'right');
  if (!left && !right) return null;
  if (!left) return right!;
  if (!right) return left;
  return left.extension >= right.extension ? left : right;
}

export function isParryFormAcceptable(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  expectedSide: 'left' | 'right' | 'either' = 'either'
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getParryFeedback(userFrames, referenceFrames);
  const f = userFrames[Math.floor(userFrames.length * 0.6)] ?? userFrames[userFrames.length - 1];
  const best = f ? pickBestArm(f) : null;
  if (best && expectedSide !== 'either' && best.side !== expectedSide) {
    feedback.push({
      id: 'wrong-parry-arm',
      message: 'WRONG ARM!',
      phase: 'impact',
      severity: 'error',
    });
  }
  const errors = feedback.filter((f) => f.severity === 'error').length;
  return { acceptable: errors <= 0, feedback };
}

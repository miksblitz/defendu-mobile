/**
 * Parry form feedback:
 * either arm is accepted as the active parry arm.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const MP = { ls: 11, rs: 12, lw: 15, rw: 16 };
const PARRY_MIN_EXTENSION = 0.26;
const PARRY_MIN_LATERAL = 0.1;
const WRIST_ABOVE_SHOULDER_MIN = 0.04;

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

type ArmScore = { side: 'left' | 'right'; extension: number; lateral: number; wristAbove: number };

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
  if (best.lateral < PARRY_MIN_LATERAL) {
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

export function isParryFormAcceptable(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getParryFeedback(userFrames, referenceFrames);
  const errors = feedback.filter((f) => f.severity === 'error').length;
  return { acceptable: errors <= 0, feedback };
}

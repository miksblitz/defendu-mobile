/**
 * Parry form feedback (parry-LEFT module wiring lives in this folder).
 *
 * Forehead/forearm rule:
 *   When the wrist OR the forearm (elbow→wrist) is at/above the eye line on
 *   either arm, the form errors (extension/lateral/wrist-above) are
 *   suppressed — the rep detector counts that side as a perfect parry on
 *   forehead alone. The wrong-arm check still runs on top, so a forehead
 *   parry with the right arm becomes a "WRONG ARM!" bad rep.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const MP = {
  nose: 0, leftEye: 2, rightEye: 5,
  ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16,
};
const PARRY_MIN_EXTENSION = 0.26;
const PARRY_MIN_LATERAL = 0.1;
const WRIST_ABOVE_SHOULDER_MIN = 0.04;

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function getEyeLineY(frame: PoseFrame): number | null {
  const leftEye = frame[MP.leftEye];
  const rightEye = frame[MP.rightEye];
  const ys: number[] = [];
  if (validPoint(leftEye)) ys.push(leftEye.y);
  if (validPoint(rightEye)) ys.push(rightEye.y);
  if (ys.length > 0) return ys.reduce((a, b) => a + b, 0) / ys.length;
  const nose = frame[MP.nose];
  if (validPoint(nose)) return nose.y - 0.06;
  return null;
}

function isWristOrForearmAtForehead(frame: PoseFrame, side: 'left' | 'right'): boolean {
  const eyeY = getEyeLineY(frame);
  if (eyeY == null) return false;
  const wrist = side === 'left' ? frame[MP.lw] : frame[MP.rw];
  if (validPoint(wrist) && wrist.y <= eyeY) return true;
  const elbow = side === 'left' ? frame[MP.le] : frame[MP.re];
  if (validPoint(elbow) && elbow.y <= eyeY) return true;
  return false;
}

function anyForeheadParry(frame: PoseFrame): boolean {
  return isWristOrForearmAtForehead(frame, 'left') || isWristOrForearmAtForehead(frame, 'right');
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

  // Forehead/forearm rule: if wrist or forearm is up at the eye line on
  // either arm, the rep detector treats it as a perfect parry, so suppress
  // all form errors here too.
  if (anyForeheadParry(f)) return [];

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

function pickBestArm(frame: PoseFrame): ArmScore | null {
  const left = armScore(frame, 'left');
  const right = armScore(frame, 'right');
  if (!left && !right) return null;
  if (!left) return right!;
  if (!right) return left;

  // If exactly one arm has wrist/forearm at the forehead, that's the parry
  // arm — use it for the wrong-arm check so the rep detector and the
  // comparator agree on which side performed the parry.
  const leftFh = isWristOrForearmAtForehead(frame, 'left');
  const rightFh = isWristOrForearmAtForehead(frame, 'right');
  if (leftFh && !rightFh) return left;
  if (rightFh && !leftFh) return right;

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

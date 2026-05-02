/**
 * Parry form feedback:
 * either arm is accepted as the active parry arm.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';

// Same concept and structure as the RIGHT-parry pipeline. Thresholds are
// slightly easier than RIGHT so the LEFT drill FEELS equivalent to the right
// for a typical (right-dominant) user. Must stay in sync with the matching
// constants in parryRepDetector.ts in this folder.
const MP = {
  nose: 0, leftEye: 2, rightEye: 5,
  ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16,
} as const;
const PARRY_MIN_EXTENSION = 0.26;
const PARRY_MIN_LATERAL = 0.085;
const WRIST_ABOVE_SHOULDER_MIN = 0.025;

// Far-distance fallback (mirrors parryRepDetector). Scales thresholds when
// the user is ~2–3 m from the camera so a counted rep doesn't trigger false
// "extend more / not wide enough" feedback errors.
const REFERENCE_BODY_SCALE = 0.25;
const FAR_DISTANCE_BODY_SCALE_MAX = 0.18;
const MIN_BODY_SCALE_FOR_FAR = 0.06;

function bodyScaleFromShoulders(frame: PoseFrame): number | null {
  if (frame.length <= MP.rs) return null;
  const ls = frame[MP.ls];
  const rs = frame[MP.rs];
  if (!validPoint(ls) || !validPoint(rs)) return null;
  return Math.hypot(ls.x - rs.x, ls.y - rs.y);
}

function distanceScale(frame: PoseFrame): number {
  const bs = bodyScaleFromShoulders(frame);
  if (bs == null) return 1;
  if (bs > FAR_DISTANCE_BODY_SCALE_MAX) return 1;
  if (bs < MIN_BODY_SCALE_FOR_FAR) return 1;
  return bs / REFERENCE_BODY_SCALE;
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

  // Forehead/eye-line exception (mirrors parryRepDetector). If either side's
  // wrist OR forearm (elbow) is at forehead level, the rep detector accepts
  // it as a perfect parry, so suppress the extension/lateral/wrist-above
  // feedback errors that would otherwise false-fire. The wrong-arm check in
  // `isParryFormAcceptable` runs separately, so a forehead rep on the wrong
  // side still becomes a bad rep.
  if (
    isWristOrForearmAtForehead(f, 'left') ||
    isWristOrForearmAtForehead(f, 'right')
  ) return [];

  const best = !left ? right! : !right ? left : left.extension >= right.extension ? left : right;
  const out: PoseFeedbackItem[] = [];

  // Scale-aware thresholds so users at 2–3 m don't get false errors.
  const scale = distanceScale(f);
  const minExtension = PARRY_MIN_EXTENSION * scale;
  const minLateral = PARRY_MIN_LATERAL * scale;
  const minWristAbove = WRIST_ABOVE_SHOULDER_MIN * scale;

  if (best.extension < minExtension) {
    out.push({
      id: 'parry-arm-not-extended',
      message: 'Extend either arm more during the parry',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (best.lateral < minLateral) {
    out.push({
      id: 'parry-not-wide-enough',
      message: 'Move the parry arm more to the side',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (best.wristAbove < minWristAbove) {
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

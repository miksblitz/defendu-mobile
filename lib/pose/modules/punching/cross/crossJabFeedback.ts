/**
 * Cross jab form feedback: user's RIGHT hand punches, user's LEFT hand in guard.
 * App UI: "Your right" = MediaPipe left. So punch = leadArm 0 (left extending), guard = MediaPipe right.
 */

import type { PoseFrame, PoseFeedbackItem, JabPhase } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';
import {
  getJabFeedback,
  computeJabMetrics,
} from '../jab/jabFeedback';

const CROSS_GUARD_MAX_EXTENSION = 0.24;  // guard arm (user's left = MediaPipe right)
const CROSS_WRIST_UP_TOL = 0.14;

/** Guard = user's left hand = MediaPipe RIGHT (indices 12,14,16). */
function rightHandInGuardFromFrame(frame: PoseFrame): { inGuard: boolean; extended: boolean; wristDown: boolean } {
  const d = armExtensionDistances(frame);
  if (!d) return { inGuard: false, extended: false, wristDown: false };
  const rs = frame[12];
  const re = frame[14];
  const rw = frame[16];
  if (!rs || !re || !rw || frame.length <= 16) return { inGuard: false, extended: false, wristDown: false };
  const extended = d.right > CROSS_GUARD_MAX_EXTENSION;
  const wristUp = rw.y <= re.y + CROSS_WRIST_UP_TOL;
  const inGuard = d.right <= CROSS_GUARD_MAX_EXTENSION && wristUp;
  return { inGuard, extended, wristDown: !wristUp };
}

/**
 * Cross jab: punching arm = user's RIGHT = MediaPipe left extending = leadArm 0. Guard = user's left = MediaPipe right.
 */
export function getJabFeedbackCross(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): PoseFeedbackItem[] {
  const base = getJabFeedback(userFrames, referenceFrames, referencePhaseBounds);
  if (userFrames.length === 0) return base;

  const impactIdx = Math.floor(userFrames.length * 0.6);
  const frame = userFrames[Math.min(impactIdx, userFrames.length - 1)]!;
  const metrics = computeJabMetrics(frame);
  const guard = rightHandInGuardFromFrame(frame);

  // Require user's RIGHT to punch = MediaPipe left extending = leadArm 0. If leadArm 1, they're jabbing with left (wrong).
  if (metrics.leadArm === 1) {
    base.push({
      id: 'wrong-arm',
      message: 'Jab with your right hand; keep left in guard (cross jab)',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (guard.extended) {
    base.push({
      id: 'rear-hand-not-in-guard',
      message: 'Keep left hand in guard (contracted, wrist up)',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (guard.wristDown && !guard.extended) {
    base.push({
      id: 'rear-hand-wrist-down',
      message: 'Keep left hand wrist up in guard',
      phase: 'impact',
      severity: 'error',
    });
  }

  return base;
}

const CROSS_ERROR_IDS = [
  'front-hand-not-extended',
  'elbow-not-straight',
  'wrong-arm',
  'rear-hand-not-in-guard',
  'rear-hand-wrist-down',
];

const CROSS_MAX_ERRORS_TO_PASS = 0;

export function isImpactFormAcceptableCross(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getJabFeedbackCross(userFrames, referenceFrames, referencePhaseBounds);
  const errorCount = feedback.filter(
    (f) => f.severity === 'error' && CROSS_ERROR_IDS.includes(f.id)
  ).length;
  return { acceptable: errorCount <= CROSS_MAX_ERRORS_TO_PASS, feedback };
}

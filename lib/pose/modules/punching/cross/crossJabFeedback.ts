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
const CROSS_HORIZONTAL_Y_TOL = 0.18;
const CROSS_CENTERLINE_MIN = 0.02;
const CROSS_TRAVEL_MIN = 0.08;

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
 * Cross should travel mostly horizontal and finish on the opposite side (cross center line).
 * Punching arm for cross = user's RIGHT = MediaPipe LEFT (11, 13, 15).
 */
function crossDirectionFromFrame(frame: PoseFrame): { horizontal: boolean; toOppositeSide: boolean } {
  const ls = frame[11];
  const lw = frame[15];
  const rs = frame[12];
  if (!ls || !lw || !rs) return { horizontal: true, toOppositeSide: true };

  const shoulderMidX = (ls.x + rs.x) / 2;
  const horizontal = Math.abs(lw.y - ls.y) <= CROSS_HORIZONTAL_Y_TOL;
  const towardOppositeSign = Math.sign(rs.x - ls.x) || 1;
  const crossedCenterline =
    (lw.x - shoulderMidX) * towardOppositeSign >= CROSS_CENTERLINE_MIN;
  const traveledAwayFromPunchShoulder =
    (lw.x - ls.x) * towardOppositeSign >= CROSS_TRAVEL_MIN;
  const toOppositeSide = crossedCenterline && traveledAwayFromPunchShoulder;
  return { horizontal, toOppositeSide };
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
  const direction = crossDirectionFromFrame(frame);

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
  if (!direction.horizontal) {
    base.push({
      id: 'cross-not-horizontal',
      message: 'Throw the straight punch more horizontally at shoulder level',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (!direction.toOppositeSide) {
    base.push({
      id: 'cross-not-to-opposite-side',
      message: 'Send your right straight to the opposite side, not on the same side',
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
  'cross-not-horizontal',
  'cross-not-to-opposite-side',
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

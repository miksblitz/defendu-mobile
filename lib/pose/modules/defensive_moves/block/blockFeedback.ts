/**
 * Block form feedback for defensive guard:
 * both hands up, both hands contracted, and guard close to face.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const MP = { nose: 0, le: 13, re: 14, lw: 15, rw: 16 };
const GUARD_MAX_EXTENSION = 0.24;
const WRIST_UP_TOL = 0.12;
const FACE_GUARD_MAX_DIST = 0.34;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

type BlockMetrics = {
  leftGuardOk: boolean;
  rightGuardOk: boolean;
  leftWristUp: boolean;
  rightWristUp: boolean;
  leftNearFace: boolean;
  rightNearFace: boolean;
};

function computeBlockMetrics(frame: PoseFrame): BlockMetrics {
  const d = armExtensionDistances(frame);
  const nose = frame[MP.nose];
  const le = frame[MP.le];
  const re = frame[MP.re];
  const lw = frame[MP.lw];
  const rw = frame[MP.rw];
  if (!d || !validPoint(nose) || !validPoint(le) || !validPoint(re) || !validPoint(lw) || !validPoint(rw)) {
    return {
      leftGuardOk: false,
      rightGuardOk: false,
      leftWristUp: false,
      rightWristUp: false,
      leftNearFace: false,
      rightNearFace: false,
    };
  }
  return {
    leftGuardOk: d.left <= GUARD_MAX_EXTENSION,
    rightGuardOk: d.right <= GUARD_MAX_EXTENSION,
    leftWristUp: lw.y <= le.y + WRIST_UP_TOL,
    rightWristUp: rw.y <= re.y + WRIST_UP_TOL,
    leftNearFace: dist(lw, nose) <= FACE_GUARD_MAX_DIST,
    rightNearFace: dist(rw, nose) <= FACE_GUARD_MAX_DIST,
  };
}

export function getBlockFeedback(userFrames: PoseFrame[], _referenceFrames: PoseFrame[] | null): PoseFeedbackItem[] {
  if (userFrames.length === 0) return [];
  const frame = userFrames[Math.floor(userFrames.length * 0.6)] ?? userFrames[userFrames.length - 1]!;
  const m = computeBlockMetrics(frame);
  const feedback: PoseFeedbackItem[] = [];

  if (!m.leftGuardOk) {
    feedback.push({
      id: 'left-hand-not-in-guard',
      message: 'Keep your left hand contracted in guard',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (!m.rightGuardOk) {
    feedback.push({
      id: 'right-hand-not-in-guard',
      message: 'Keep your right hand contracted in guard',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (!m.leftWristUp) {
    feedback.push({
      id: 'left-wrist-not-up',
      message: 'Raise your left wrist higher when blocking',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (!m.rightWristUp) {
    feedback.push({
      id: 'right-wrist-not-up',
      message: 'Raise your right wrist higher when blocking',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (!m.leftNearFace || !m.rightNearFace) {
    feedback.push({
      id: 'guard-too-far-from-face',
      message: 'Bring both hands closer to your face for proper cover',
      phase: 'impact',
      severity: 'warning',
    });
  }

  return feedback;
}

const BLOCK_ERROR_IDS = [
  'left-hand-not-in-guard',
  'right-hand-not-in-guard',
  'left-wrist-not-up',
  'right-wrist-not-up',
];

export function isBlockFormAcceptable(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getBlockFeedback(userFrames, referenceFrames);
  const errorCount = feedback.filter((f) => f.severity === 'error' && BLOCK_ERROR_IDS.includes(f.id)).length;
  return { acceptable: errorCount <= 0, feedback };
}

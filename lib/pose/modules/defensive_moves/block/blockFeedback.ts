/**
 * Block form feedback for defensive guard:
 * both hands up, both hands contracted, and guard close to face.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const MP = { nose: 0, le: 13, re: 14, lw: 15, rw: 16 };
const GUARD_MAX_EXTENSION = 0.24;
const WRIST_UP_TOL = 0.12;
/** Mirrors blockRepDetector's tightened fist-at-face thresholds. */
const FACE_FIST_MAX_DIST = 0.18;
const FACE_FIST_MAX_ABOVE_NOSE = 0.05;
const FACE_FIST_MAX_BELOW_NOSE = 0.18;
const FOREARM_MIN_VERTICAL_DY = 0.05;
const FOREARM_MAX_SIDEWAYS_RATIO = 0.5;
/** Looser ratio cap for the inward-angled "/.\" exception (mirrors blockRepDetector). */
const FOREARM_INWARD_MAX_SIDEWAYS_RATIO = 1.5;

function isForearmInwardAngled(
  elbow: { x: number; y: number },
  wrist: { x: number; y: number },
  nose: { x: number; y: number }
): boolean {
  const dy = Math.abs(wrist.y - elbow.y);
  const dx = Math.abs(wrist.x - elbow.x);
  if (dy < FOREARM_MIN_VERTICAL_DY) return false;
  if (dx > dy * FOREARM_INWARD_MAX_SIDEWAYS_RATIO) return false;
  return Math.abs(wrist.x - nose.x) < Math.abs(elbow.x - nose.x);
}

function isFistAtFace(
  wrist: { x: number; y: number },
  nose: { x: number; y: number }
): boolean {
  if (dist(wrist, nose) > FACE_FIST_MAX_DIST) return false;
  const wristAboveNose = nose.y - wrist.y;
  if (wristAboveNose > FACE_FIST_MAX_ABOVE_NOSE) return false;
  const wristBelowNose = wrist.y - nose.y;
  if (wristBelowNose > FACE_FIST_MAX_BELOW_NOSE) return false;
  return true;
}

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
  leftForearmVertical: boolean;
  rightForearmVertical: boolean;
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
      leftForearmVertical: false,
      rightForearmVertical: false,
      leftNearFace: false,
      rightNearFace: false,
    };
  }
  const leftForearmDx = Math.abs(lw.x - le.x);
  const rightForearmDx = Math.abs(rw.x - re.x);
  const leftForearmDy = Math.abs(lw.y - le.y);
  const rightForearmDy = Math.abs(rw.y - re.y);

  const leftForearmVertical =
    leftForearmDy >= FOREARM_MIN_VERTICAL_DY &&
    leftForearmDx <= leftForearmDy * FOREARM_MAX_SIDEWAYS_RATIO;
  const rightForearmVertical =
    rightForearmDy >= FOREARM_MIN_VERTICAL_DY &&
    rightForearmDx <= rightForearmDy * FOREARM_MAX_SIDEWAYS_RATIO;
  // Inward-angled "/.\" exception — accept reps where the forearms angle
  // inward toward the centerline instead of being strictly vertical.
  const leftForearmShapeOk = leftForearmVertical || isForearmInwardAngled(le, lw, nose);
  const rightForearmShapeOk = rightForearmVertical || isForearmInwardAngled(re, rw, nose);

  return {
    leftGuardOk: d.left <= GUARD_MAX_EXTENSION,
    rightGuardOk: d.right <= GUARD_MAX_EXTENSION,
    leftWristUp: lw.y <= le.y + WRIST_UP_TOL,
    rightWristUp: rw.y <= re.y + WRIST_UP_TOL,
    leftForearmVertical: leftForearmShapeOk,
    rightForearmVertical: rightForearmShapeOk,
    leftNearFace: isFistAtFace(lw, nose),
    rightNearFace: isFistAtFace(rw, nose),
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
  if (!m.leftForearmVertical) {
    feedback.push({
      id: 'left-forearm-not-vertical',
      message: 'Keep your left forearm vertical and pointing up (not sideways).',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (!m.rightForearmVertical) {
    feedback.push({
      id: 'right-forearm-not-vertical',
      message: 'Keep your right forearm vertical and pointing up (not sideways).',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (!m.leftNearFace || !m.rightNearFace) {
    feedback.push({
      id: 'guard-too-far-from-face',
      message: 'Bring both fists up to touch your lips/chin to cover your face',
      phase: 'impact',
      severity: 'error',
    });
  }

  return feedback;
}

const BLOCK_ERROR_IDS = [
  'left-hand-not-in-guard',
  'right-hand-not-in-guard',
  'left-wrist-not-up',
  'right-wrist-not-up',
  'left-forearm-not-vertical',
  'right-forearm-not-vertical',
  'guard-too-far-from-face',
];

export function isBlockFormAcceptable(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getBlockFeedback(userFrames, referenceFrames);
  const errorCount = feedback.filter((f) => f.severity === 'error' && BLOCK_ERROR_IDS.includes(f.id)).length;
  return { acceptable: errorCount <= 0, feedback };
}

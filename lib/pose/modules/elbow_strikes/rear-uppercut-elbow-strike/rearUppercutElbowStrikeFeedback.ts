/**
 * Rear uppercut elbow strike feedback.
 */

import type { PoseFrame, PoseFeedbackItem, JabPhase } from '../../../types';

const MP = { ls: 11, le: 13, lw: 15, rs: 12, re: 14, rw: 16 };
const MN17 = { ls: 5, le: 7, lw: 9, rs: 6, re: 8, rw: 10 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function elbowMetricsFromIndices(
  frame: PoseFrame,
  shoulderIdx: number,
  elbowIdx: number,
  wristIdx: number
): { elbowLift: number; elbowFromShoulder: number; wristAboveElbow: number } | null {
  if (frame.length <= Math.max(shoulderIdx, elbowIdx, wristIdx)) return null;
  const shoulder = frame[shoulderIdx];
  const elbow = frame[elbowIdx];
  const wrist = frame[wristIdx];
  if (!validPoint(shoulder) || !validPoint(elbow) || !validPoint(wrist)) return null;
  return {
    elbowLift: shoulder.y - elbow.y,
    elbowFromShoulder: Math.abs(elbow.x - shoulder.x),
    wristAboveElbow: elbow.y - wrist.y,
  };
}

function bestMetricsForSide(frame: PoseFrame, side: 'left' | 'right') {
  const mp = side === 'left'
    ? elbowMetricsFromIndices(frame, MP.ls, MP.le, MP.lw)
    : elbowMetricsFromIndices(frame, MP.rs, MP.re, MP.rw);
  const mn = side === 'left'
    ? elbowMetricsFromIndices(frame, MN17.ls, MN17.le, MN17.lw)
    : elbowMetricsFromIndices(frame, MN17.rs, MN17.re, MN17.rw);
  if (!mp && !mn) return null;
  if (!mp) return mn!;
  if (!mn) return mp;
  return mp.elbowLift >= mn.elbowLift ? mp : mn;
}

export function getRearUppercutElbowStrikeFeedback(
  userFrames: PoseFrame[],
  _referenceFrames: PoseFrame[] | null,
  _referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): PoseFeedbackItem[] {
  void _referenceFrames;
  void _referencePhaseBounds;

  if (userFrames.length === 0) return [];
  const left = bestMetricsForSide(userFrames[Math.floor(userFrames.length * 0.5)]!, 'left');
  const right = bestMetricsForSide(userFrames[Math.floor(userFrames.length * 0.5)]!, 'right');
  if (!left && !right) {
    return [{
      id: 'rear-uppercut-elbow-no-data',
      message: 'Need clearer elbow landmarks to detect your rear elbow strike.',
      phase: 'impact',
      severity: 'error',
    }];
  }

  const GOOD_MIN_REAR_ELBOW_LIFT = 0.10;
  const GOOD_MAX_REAR_ELBOW_FROM_SHOULDER = 0.35;
  const candidates = [left, right].filter((x): x is NonNullable<typeof left> => x != null);
  const leftOk = !!left && left.elbowLift >= GOOD_MIN_REAR_ELBOW_LIFT && left.elbowFromShoulder <= GOOD_MAX_REAR_ELBOW_FROM_SHOULDER;
  const rightOk = !!right && right.elbowLift >= GOOD_MIN_REAR_ELBOW_LIFT && right.elbowFromShoulder <= GOOD_MAX_REAR_ELBOW_FROM_SHOULDER;
  if (leftOk || rightOk) return [];

  const best = candidates.reduce((b, cur) => (cur.elbowLift > b.elbowLift ? cur : b), candidates[0]!);
  const errors: PoseFeedbackItem[] = [];
  if (best.elbowLift < GOOD_MIN_REAR_ELBOW_LIFT) {
    errors.push({
      id: 'rear-uppercut-elbow-not-lifted-enough',
      message: 'Lift your striking elbow higher at impact.',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (best.elbowFromShoulder > GOOD_MAX_REAR_ELBOW_FROM_SHOULDER) {
    errors.push({
      id: 'rear-uppercut-elbow-too-far-from-shoulder',
      message: 'Keep the elbow closer to the shoulder line (not too flared).',
      phase: 'impact',
      severity: 'error',
    });
  }
  return errors;
}

const REAR_UPPERCUT_ELBOW_STRIKE_ERROR_IDS = [
  'rear-uppercut-elbow-no-data',
  'rear-uppercut-elbow-not-lifted-enough',
  'rear-uppercut-elbow-too-far-from-shoulder',
];

export function isImpactFormAcceptableRearUppercutElbowStrike(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getRearUppercutElbowStrikeFeedback(userFrames, referenceFrames, referencePhaseBounds);
  const errorCount = feedback.filter((f) => f.severity === 'error' && REAR_UPPERCUT_ELBOW_STRIKE_ERROR_IDS.includes(f.id)).length;
  return { acceptable: errorCount <= 0, feedback };
}


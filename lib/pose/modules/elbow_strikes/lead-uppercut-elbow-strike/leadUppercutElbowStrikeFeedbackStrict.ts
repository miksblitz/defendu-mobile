/**
 * Lead uppercut elbow strike feedback (STRICT: strike arm only + guard-up other hand).
 *
 * Strike arm = user LEFT hand (dataset MediaPipe RIGHT arm).
 * Guard-up = user RIGHT hand stays in guard (dataset MediaPipe LEFT arm).
 */

import type { PoseFrame, PoseFeedbackItem, JabPhase } from '../../../types';

const MP_RIGHT = { sh: 12, el: 14, wr: 16 };
const MN17_RIGHT = { sh: 6, el: 8, wr: 10 };
const MP_LEFT = { sh: 11, el: 13, wr: 15 };
const MN17_LEFT = { sh: 5, el: 7, wr: 9 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function metricsFromIndices(
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

  const elbowLift = shoulder.y - elbow.y;
  const elbowFromShoulder = Math.abs(elbow.x - shoulder.x);
  const wristAboveElbow = elbow.y - wrist.y;
  return { elbowLift, elbowFromShoulder, wristAboveElbow };
}

function bestRightStrikeMetrics(frame: PoseFrame) {
  const mp = metricsFromIndices(frame, MP_RIGHT.sh, MP_RIGHT.el, MP_RIGHT.wr);
  const mn = metricsFromIndices(frame, MN17_RIGHT.sh, MN17_RIGHT.el, MN17_RIGHT.wr);
  if (!mp && !mn) return null;
  if (!mp) return mn!;
  if (!mn) return mp;
  return mp.elbowLift >= mn.elbowLift ? mp : mn;
}

function bestLeftGuardMetrics(frame: PoseFrame) {
  const mp = metricsFromIndices(frame, MP_LEFT.sh, MP_LEFT.el, MP_LEFT.wr);
  const mn = metricsFromIndices(frame, MN17_LEFT.sh, MN17_LEFT.el, MN17_LEFT.wr);
  if (!mp && !mn) return null;
  if (!mp) return mn!;
  if (!mn) return mp;
  return mp.wristAboveElbow >= mn.wristAboveElbow ? mp : mn;
}

function elbowAngleDeg(
  shoulder: { x: number; y: number },
  elbow: { x: number; y: number },
  wrist: { x: number; y: number }
): number {
  const ax = shoulder.x - elbow.x;
  const ay = shoulder.y - elbow.y;
  const bx = wrist.x - elbow.x;
  const by = wrist.y - elbow.y;
  const dot = ax * bx + ay * by;
  const magA = Math.sqrt(ax * ax + ay * ay) || 1e-6;
  const magB = Math.sqrt(bx * bx + by * by) || 1e-6;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function bestRightElbowAngleDeg(frame: PoseFrame): number | null {
  const candidates: number[] = [];

  const mpS = frame[MP_RIGHT.sh];
  const mpE = frame[MP_RIGHT.el];
  const mpW = frame[MP_RIGHT.wr];
  if (mpS && mpE && mpW && validPoint(mpS) && validPoint(mpE) && validPoint(mpW)) {
    candidates.push(elbowAngleDeg(mpS, mpE, mpW));
  }

  const mnS = frame[MN17_RIGHT.sh];
  const mnE = frame[MN17_RIGHT.el];
  const mnW = frame[MN17_RIGHT.wr];
  if (mnS && mnE && mnW && validPoint(mnS) && validPoint(mnE) && validPoint(mnW)) {
    candidates.push(elbowAngleDeg(mnS, mnE, mnW));
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

const GOOD_MIN_RIGHT_ELBOW_LIFT = 0.0;
const GOOD_MAX_RIGHT_ELBOW_FROM_SHOULDER = 0.35;
const GUARD_UP_MIN_WRIST_ABOVE_ELBOW = 0.07;
const GOOD_MAX_RIGHT_ELBOW_LIFT = 0.33;
const STRIKE_MAX_WRIST_ABOVE_ELBOW = 0.04;
const MIN_ELBOW_STRAIGHT_ANGLE_DEG = 165;

const ERROR_IDS = {
  strikeNotGood: 'lead-uppercut-elbow-not-good-position',
  strikeTooHigh: 'lead-uppercut-elbow-strike-too-high',
  strikeNotStraight: 'lead-uppercut-elbow-not-straight',
  guardNotUp: 'rear-hand-not-in-guard',
} as const;

export function getLeadUppercutElbowStrikeFeedbackStrict(
  userFrames: PoseFrame[],
  _referenceFrames: PoseFrame[] | null,
  _referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): PoseFeedbackItem[] {
  void _referenceFrames;
  void _referencePhaseBounds;

  if (userFrames.length === 0) return [];

  const feedback: PoseFeedbackItem[] = [];
  let bestStrike: ReturnType<typeof bestRightStrikeMetrics> | null = null;
  let minGuardWristAboveElbow: number | null = null;
  let minElbowAngleAcrossFrames: number | null = null;

  for (const f of userFrames) {
    const s = bestRightStrikeMetrics(f);
    if (s && (!bestStrike || s.elbowLift > bestStrike.elbowLift)) bestStrike = s;

    const angle = bestRightElbowAngleDeg(f);
    if (angle != null) {
      minElbowAngleAcrossFrames =
        minElbowAngleAcrossFrames == null ? angle : Math.min(minElbowAngleAcrossFrames, angle);
    }

    const g = bestLeftGuardMetrics(f);
    if (g) {
      minGuardWristAboveElbow =
        minGuardWristAboveElbow == null ? g.wristAboveElbow : Math.min(minGuardWristAboveElbow, g.wristAboveElbow);
    }
  }

  if (minGuardWristAboveElbow == null) {
    feedback.push({
      id: ERROR_IDS.guardNotUp,
      message: 'Keep your guard hand wrist up while striking.',
      phase: 'impact',
      severity: 'error',
    });
    return feedback;
  }

  if (minGuardWristAboveElbow < GUARD_UP_MIN_WRIST_ABOVE_ELBOW) {
    feedback.push({
      id: ERROR_IDS.guardNotUp,
      message: 'Keep your guard hand wrist up (guard hand not in guard).',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (!bestStrike) {
    feedback.push({
      id: ERROR_IDS.strikeNotGood,
      message: 'Lift your striking elbow higher at impact.',
      phase: 'impact',
      severity: 'error',
    });
    return feedback;
  }

  const strikeOk =
    bestStrike.elbowLift >= GOOD_MIN_RIGHT_ELBOW_LIFT &&
    bestStrike.elbowFromShoulder <= GOOD_MAX_RIGHT_ELBOW_FROM_SHOULDER &&
    bestStrike.elbowLift <= GOOD_MAX_RIGHT_ELBOW_LIFT &&
    bestStrike.wristAboveElbow <= STRIKE_MAX_WRIST_ABOVE_ELBOW &&
    (minElbowAngleAcrossFrames ?? 0) >= MIN_ELBOW_STRAIGHT_ANGLE_DEG;

  if (!strikeOk) {
    if (bestStrike.elbowLift > GOOD_MAX_RIGHT_ELBOW_LIFT) {
      feedback.push({
        id: ERROR_IDS.strikeTooHigh,
        message: 'Lower your striking elbow slightly; don’t lift it too high at impact.',
        phase: 'impact',
        severity: 'error',
      });
    } else if ((minElbowAngleAcrossFrames ?? 0) < MIN_ELBOW_STRAIGHT_ANGLE_DEG) {
      feedback.push({
        id: ERROR_IDS.strikeNotStraight,
        message: 'Keep your striking arm straight and level with your shoulder.',
        phase: 'impact',
        severity: 'error',
      });
    } else if (bestStrike.wristAboveElbow > STRIKE_MAX_WRIST_ABOVE_ELBOW) {
      feedback.push({
        id: ERROR_IDS.strikeNotGood,
        message: 'Keep the forearm more level; don’t point your wrist upward above the elbow.',
        phase: 'impact',
        severity: 'error',
      });
    } else {
      feedback.push({
        id: ERROR_IDS.strikeNotGood,
        message: 'Lift your striking elbow into the correct height band at impact.',
        phase: 'impact',
        severity: 'error',
      });
    }
  }

  return feedback;
}

export function isImpactFormAcceptableLeadUppercutElbowStrikeStrict(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getLeadUppercutElbowStrikeFeedbackStrict(userFrames, referenceFrames, referencePhaseBounds);
  const errorIds = [ERROR_IDS.strikeNotGood, ERROR_IDS.strikeTooHigh, ERROR_IDS.strikeNotStraight, ERROR_IDS.guardNotUp];
  const errorCount = feedback.filter((f) => f.severity === 'error' && errorIds.includes(f.id as any)).length;
  return { acceptable: errorCount <= 0, feedback };
}


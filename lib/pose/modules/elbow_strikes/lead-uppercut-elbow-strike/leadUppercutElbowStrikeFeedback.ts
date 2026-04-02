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
): { elbowLift: number; wristAboveElbow: number } | null {
  if (frame.length <= Math.max(shoulderIdx, elbowIdx, wristIdx)) return null;
  const shoulder = frame[shoulderIdx];
  const elbow = frame[elbowIdx];
  const wrist = frame[wristIdx];
  if (!validPoint(shoulder) || !validPoint(elbow) || !validPoint(wrist)) return null;
  return {
    elbowLift: shoulder.y - elbow.y,
    wristAboveElbow: elbow.y - wrist.y,
  };
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

const FINAL_MIN_LIFT = 0.27;
const TRANSITION_MIN_LIFT = 0.2;
const FINAL_MAX_WRIST_ABOVE_ELBOW = -0.18;
const GUARD_MIN_WRIST_ABOVE_ELBOW = 0.1;

const ERROR_IDS = {
  noTransition: 'lead-uppercut-elbow-transition-missing',
  noImpact: 'lead-uppercut-elbow-final-missing',
  guardNotUp: 'lead-uppercut-elbow-guard-not-up',
  forearmWrong: 'lead-uppercut-elbow-forearm-not-down',
} as const;

export function getLeadUppercutElbowStrikeFeedback(
  userFrames: PoseFrame[],
  _referenceFrames: PoseFrame[] | null,
  _referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): PoseFeedbackItem[] {
  void _referenceFrames;
  void _referencePhaseBounds;

  if (userFrames.length === 0) return [];

  let guardMin = Infinity;
  let maxLift = -Infinity;
  let minWristAboveElbowAtHighLift = Infinity;
  let transitionSeen = false;

  for (const frame of userFrames) {
    const strike = bestRightStrikeMetrics(frame);
    const guard = bestLeftGuardMetrics(frame);
    if (guard) guardMin = Math.min(guardMin, guard.wristAboveElbow);
    if (!strike) continue;
    maxLift = Math.max(maxLift, strike.elbowLift);
    if (strike.elbowLift >= TRANSITION_MIN_LIFT) transitionSeen = true;
    if (strike.elbowLift >= FINAL_MIN_LIFT) {
      minWristAboveElbowAtHighLift = Math.min(minWristAboveElbowAtHighLift, strike.wristAboveElbow);
    }
  }

  const feedback: PoseFeedbackItem[] = [];

  if (!(guardMin >= GUARD_MIN_WRIST_ABOVE_ELBOW)) {
    feedback.push({
      id: ERROR_IDS.guardNotUp,
      message: 'Keep your rear hand up in guard during the whole elbow strike.',
      phase: 'impact',
      severity: 'error',
    });
  }
  if (!transitionSeen) {
    feedback.push({
      id: ERROR_IDS.noTransition,
      message: 'Show the transition: raise the lead elbow up before the final strike position.',
      phase: 'extension',
      severity: 'error',
    });
  }
  if (!(maxLift >= FINAL_MIN_LIFT)) {
    feedback.push({
      id: ERROR_IDS.noImpact,
      message: 'Lift and flare the lead elbow higher to reach the final elbow-strike position.',
      phase: 'impact',
      severity: 'error',
    });
  } else if (!(minWristAboveElbowAtHighLift <= FINAL_MAX_WRIST_ABOVE_ELBOW)) {
    feedback.push({
      id: ERROR_IDS.forearmWrong,
      message: 'At the final elbow position, keep your forearm down (wrist should stay below elbow).',
      phase: 'impact',
      severity: 'error',
    });
  }

  return feedback;
}

const LEAD_ELBOW_ERROR_IDS = new Set<string>([
  ERROR_IDS.noTransition,
  ERROR_IDS.noImpact,
  ERROR_IDS.guardNotUp,
  ERROR_IDS.forearmWrong,
]);

export function isImpactFormAcceptableLeadUppercutElbowStrike(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getLeadUppercutElbowStrikeFeedback(userFrames, referenceFrames, referencePhaseBounds);
  const errors = feedback.filter((f) => f.severity === 'error' && LEAD_ELBOW_ERROR_IDS.has(f.id)).length;
  return { acceptable: errors <= 0, feedback };
}


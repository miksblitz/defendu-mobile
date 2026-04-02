/**
 * Lead uppercut form feedback: dedicated elbow-uppercut checks.
 * User's LEFT arm strikes (MediaPipe right side), user's RIGHT hand stays in guard.
 */

import type { PoseFrame, PoseFeedbackItem, JabPhase } from '../../../types';

const MP = { ls: 11, le: 13, lw: 15, rs: 12, re: 14, rw: 16 };
const MN17 = { ls: 5, le: 7, lw: 9, rs: 6, re: 8, rw: 10 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function armIndex(frame: PoseFrame): typeof MP | typeof MN17 | null {
  return frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
}

function leftHandInGuard(frame: PoseFrame): boolean {
  const idx = armIndex(frame);
  if (!idx || frame.length <= Math.max(idx.ls, idx.le, idx.lw)) return false;
  const ls = frame[idx.ls];
  const le = frame[idx.le];
  const lw = frame[idx.lw];
  if (!validPoint(ls) || !validPoint(le) || !validPoint(lw)) return false;
  const guardDist = Math.sqrt((lw.x - ls.x) ** 2 + (lw.y - ls.y) ** 2);
  const wristUp = lw.y <= le.y + 0.14;
  return guardDist <= 0.26 && wristUp;
}

function uppercutMetrics(
  frame: PoseFrame
): { wristLift: number | null; elbowLift: number | null; horizontal: number | null } {
  const idx = armIndex(frame);
  if (!idx || frame.length <= Math.max(idx.rs, idx.re, idx.rw)) {
    return { wristLift: null, elbowLift: null, horizontal: null };
  }
  const rs = frame[idx.rs];
  const re = frame[idx.re];
  const rw = frame[idx.rw];
  if (!validPoint(rs) || !validPoint(re) || !validPoint(rw)) {
    return { wristLift: null, elbowLift: null, horizontal: null };
  }
  return {
    wristLift: rs.y - rw.y,
    elbowLift: rs.y - re.y,
    horizontal: Math.abs(rw.x - rs.x),
  };
}

const MIN_IMPACT_WRIST_LIFT = 0.04;
const MIN_IMPACT_ELBOW_LIFT = 0.005;
const MIN_ELBOW_LIFT_DELTA = 0.02;
const MAX_IMPACT_HORIZONTAL = 0.27;

export function getLeadUppercutFeedback(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): PoseFeedbackItem[] {
  void referenceFrames;
  void referencePhaseBounds;

  const feedback: PoseFeedbackItem[] = [];
  if (userFrames.length === 0) return feedback;

  const first = userFrames[0]!;
  const impactIdx = Math.floor(userFrames.length * 0.5);
  const impact = userFrames[Math.min(impactIdx, userFrames.length - 1)]!;
  const startMetrics = uppercutMetrics(first);
  const impactMetrics = uppercutMetrics(impact);

  if (!leftHandInGuard(impact)) {
    feedback.push({
      id: 'rear-hand-not-in-guard',
      message: 'Keep your right hand in guard while throwing the lead uppercut.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (impactMetrics.wristLift != null && impactMetrics.wristLift < MIN_IMPACT_WRIST_LIFT) {
    feedback.push({
      id: 'uppercut-not-upward-enough',
      message: 'Drive up more. Lift your striking side higher on the uppercut.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (impactMetrics.elbowLift != null && impactMetrics.elbowLift < MIN_IMPACT_ELBOW_LIFT) {
    feedback.push({
      id: 'uppercut-elbow-not-high-enough',
      message: 'Bring your elbow up higher; aim elbow around shoulder level or higher.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (startMetrics.elbowLift != null && impactMetrics.elbowLift != null) {
    const elbowLiftDelta = impactMetrics.elbowLift - startMetrics.elbowLift;
    if (elbowLiftDelta < MIN_ELBOW_LIFT_DELTA) {
      feedback.push({
        id: 'uppercut-elbow-did-not-rise',
        message: 'Start from guard then rise up; your elbow needs a clearer upward travel.',
        phase: 'impact',
        severity: 'error',
      });
    }
  }

  if (impactMetrics.horizontal != null && impactMetrics.horizontal > MAX_IMPACT_HORIZONTAL) {
    feedback.push({
      id: 'uppercut-too-sideways',
      message: 'Keep it tight and upward; do not swing too far outward.',
      phase: 'impact',
      severity: 'error',
    });
  }

  return feedback;
}

const LEAD_UPPERCUT_ERROR_IDS = [
  'rear-hand-not-in-guard',
  'uppercut-not-upward-enough',
  'uppercut-elbow-not-high-enough',
  'uppercut-elbow-did-not-rise',
  'uppercut-too-sideways',
];

export function isImpactFormAcceptableLeadUppercut(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getLeadUppercutFeedback(userFrames, referenceFrames, referencePhaseBounds);
  const errorCount = feedback.filter(
    (f) => f.severity === 'error' && LEAD_UPPERCUT_ERROR_IDS.includes(f.id)
  ).length;
  return { acceptable: errorCount <= 0, feedback };
}

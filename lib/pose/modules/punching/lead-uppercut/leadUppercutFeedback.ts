/**
 * Lead uppercut form feedback: user's LEFT hand throws the uppercut, user's RIGHT hand in guard.
 * Reuses orthodox jab feedback but adds uppercut‑specific checks so straight jabs don't pass.
 */

import type { PoseFrame, PoseFeedbackItem, JabPhase } from '../../../types';
import { getJabFeedbackOrthodox } from '../jab/jabFeedback';

const MP = { rs: 12, rw: 16 };

/** Compute vertical lift (shoulder.y - wrist.y) and horizontal offset |wrist.x - shoulder.x|. */
function punchLiftAndHorizontal(frame: PoseFrame): { lift: number | null; horizontal: number | null } {
  if (frame.length <= MP.rw) return { lift: null, horizontal: null };
  const rs = frame[MP.rs];
  const rw = frame[MP.rw];
  if (!rs || !rw || !Number.isFinite(rs.x) || !Number.isFinite(rs.y) || !Number.isFinite(rw.x) || !Number.isFinite(rw.y)) {
    return { lift: null, horizontal: null };
  }
  const lift = rs.y - rw.y; // positive when wrist goes above shoulder (uppercut travels upward)
  const horizontal = Math.abs(rw.x - rs.x);
  return { lift, horizontal };
}

// Tuned heuristics: require a clear upward path and avoid long sideways jabs
const MIN_IMPACT_LIFT = 0.04;          // wrist at impact should be noticeably above shoulder
const MIN_LIFT_DELTA = 0.03;           // between start of rep and impact, must travel upward
const MAX_IMPACT_HORIZONTAL = 0.25;    // too far sideways = jab‑like, not uppercut

export function getLeadUppercutFeedback(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): PoseFeedbackItem[] {
  const base = getJabFeedbackOrthodox(userFrames, referenceFrames, referencePhaseBounds);

  const mapped = base.map((f) => {
    if (f.message.includes('Jab')) {
      return { ...f, message: f.message.replace(/Jab/g, 'Uppercut').replace(/jab/g, 'uppercut') };
    }
    if (f.id === 'wrong-arm') {
      return { ...f, message: 'Uppercut with your left hand; keep right in guard' };
    }
    return f;
  });

  if (userFrames.length > 1) {
    const first = userFrames[0]!;
    const impactIdx = Math.floor(userFrames.length * 0.5);
    const impact = userFrames[Math.min(impactIdx, userFrames.length - 1)]!;
    const startMetrics = punchLiftAndHorizontal(first);
    const impactMetrics = punchLiftAndHorizontal(impact);

    if (impactMetrics.lift != null && startMetrics.lift != null) {
      const liftDelta = impactMetrics.lift - startMetrics.lift;
      if (impactMetrics.lift < MIN_IMPACT_LIFT || liftDelta < MIN_LIFT_DELTA) {
        mapped.push({
          id: 'uppercut-not-upward-enough',
          message: 'Drive the uppercut upward so the fist travels clearly up, not just straight forward like a jab.',
          phase: 'impact',
          severity: 'error',
        });
      }
    }

    if (impactMetrics.horizontal != null && impactMetrics.horizontal > MAX_IMPACT_HORIZONTAL) {
      mapped.push({
        id: 'uppercut-too-sideways',
        message: 'Keep the uppercut tight under you — do not punch too far out to the side like a jab.',
        phase: 'impact',
        severity: 'error',
      });
    }
  }

  return mapped;
}

const LEAD_UPPERCUT_ERROR_IDS = [
  'front-hand-not-extended',
  'elbow-not-straight',
  'wrong-arm',
  'rear-hand-not-in-guard',
  'rear-hand-wrist-down',
  'uppercut-not-upward-enough',
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


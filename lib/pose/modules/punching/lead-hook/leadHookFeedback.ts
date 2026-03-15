/**
 * Lead hook form feedback: user's LEFT hand throws the hook, user's RIGHT hand in guard.
 * Same form as orthodox jab (left punch, right guard). Rejects straight-arm (jab-like) – hook must have a bend.
 */

import type { PoseFrame, PoseFeedbackItem, JabPhase } from '../../../types';
import { getJabFeedbackOrthodox } from '../jab/jabFeedback';

const MP = { rs: 12, re: 14, rw: 16 };

/** Elbow angle in degrees (180 = straight). Punching arm = MediaPipe right. */
function rightElbowAngleDeg(frame: PoseFrame): number | null {
  if (frame.length <= 16) return null;
  const rs = frame[MP.rs];
  const re = frame[MP.re];
  const rw = frame[MP.rw];
  if (!rs || !re || !rw || !Number.isFinite(rs.x) || !Number.isFinite(re.x) || !Number.isFinite(rw.x)) return null;
  const ax = rs.x - re.x;
  const ay = rs.y - re.y;
  const bx = rw.x - re.x;
  const by = rw.y - re.y;
  const dot = ax * bx + ay * by;
  const magA = Math.sqrt(ax * ax + ay * ay) || 1e-6;
  const magB = Math.sqrt(bx * bx + by * by) || 1e-6;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** If elbow is this straight or straighter, it's a jab not a hook. */
const HOOK_MAX_ELBOW_ANGLE_DEG = 162;

/** Lead hook: same arm rules as orthodox jab; reject straight arm (jab-like). */
export function getLeadHookFeedback(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): PoseFeedbackItem[] {
  const base = getJabFeedbackOrthodox(userFrames, referenceFrames, referencePhaseBounds);
  const mapped = base.map((f) => {
    if (f.message.includes('Jab')) {
      return { ...f, message: f.message.replace(/Jab/g, 'Hook').replace(/jab/g, 'hook') };
    }
    if (f.id === 'wrong-arm') {
      return { ...f, message: 'Hook with your left hand; keep right in guard' };
    }
    return f;
  });

  if (userFrames.length > 0) {
    const impactIdx = Math.floor(userFrames.length * 0.5);
    const frame = userFrames[Math.min(impactIdx, userFrames.length - 1)]!;
    const angle = rightElbowAngleDeg(frame);
    if (angle != null && angle >= HOOK_MAX_ELBOW_ANGLE_DEG) {
      mapped.push({
        id: 'arm-too-straight-hook',
        message: 'Bend the elbow – that’s a jab. For a hook keep a curve, arm not straight like a stick.',
        phase: 'impact',
        severity: 'error',
      });
    }
  }

  return mapped;
}

const LEAD_HOOK_ERROR_IDS = [
  'front-hand-not-extended',
  'elbow-not-straight',
  'wrong-arm',
  'rear-hand-not-in-guard',
  'rear-hand-wrist-down',
  'arm-too-straight-hook',
];

export function isImpactFormAcceptableLeadHook(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getLeadHookFeedback(userFrames, referenceFrames, referencePhaseBounds);
  const errorCount = feedback.filter(
    (f) => f.severity === 'error' && LEAD_HOOK_ERROR_IDS.includes(f.id)
  ).length;
  return { acceptable: errorCount <= 0, feedback };
}

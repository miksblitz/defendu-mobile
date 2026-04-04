/**
 * Lead low kick — feedback matches strike geometry, including “no high chamber” hints.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import {
  getIdx,
  inLeadLowKickStrikePose,
  KICK_KNEE_INTERIOR_MAX_DEG,
  KICK_KNEE_INTERIOR_MIN_DEG,
  KICK_KNEE_MAX_CLEAR_ABOVE_HIP_Y,
  KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y,
  rightKneeInteriorAngleDeg,
  validPoint,
} from './leadLowKickGeometry';

export function getLeadLowKickFormFeedback(
  userFrames: PoseFrame[]
): { passed: boolean; feedback: PoseFeedbackItem[] } {
  const idx = userFrames.length > 0 ? getIdx(userFrames[0]!) : null;
  if (!idx) {
    return {
      passed: false,
      feedback: [{ id: 'kick-landmarks', message: 'Leg landmarks not detected clearly enough', severity: 'hint' }],
    };
  }

  let sawStrike = false;
  let sawHighKneeSwing = false;
  let chainMin = 400.0;
  let chainMax = -1.0;

  const kickingKneeTooHigh = (f: typeof userFrames[number]): boolean => {
    const hip = f[idx.rh];
    const knee = f[idx.rk];
    const ankle = f[idx.ra];
    const sup = f[idx.la];
    if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle) || !validPoint(sup)) return false;
    if (!(ankle.y <= sup.y - KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y)) return false;
    return knee.y < hip.y - KICK_KNEE_MAX_CLEAR_ABOVE_HIP_Y;
  };

  for (const f of userFrames) {
    if (inLeadLowKickStrikePose(f, idx)) sawStrike = true;
    if (kickingKneeTooHigh(f)) sawHighKneeSwing = true;
    const a = rightKneeInteriorAngleDeg(f, idx);
    if (a != null) {
      chainMin = Math.min(chainMin, a);
      chainMax = Math.max(chainMax, a);
    }
  }

  const feedback: PoseFeedbackItem[] = [];
  if (!sawStrike) {
    feedback.push({
      id: 'lead-low-kick',
      message: sawHighKneeSwing
        ? 'Keep the knee below hip height — this is a low kick, not a raised knee / chamber'
        : 'Low kick: swing the whole leg out on a diagonal — hip to foot off the ground. A little knee bend is fine; no need to hike the knee like a knee strike',
      severity: 'hint',
    });
  }
  if (chainMax >= 0 && (chainMin < KICK_KNEE_INTERIOR_MIN_DEG || chainMax > KICK_KNEE_INTERIOR_MAX_DEG)) {
    feedback.push({
      id: 'kick-leg-line',
      message: 'Keep the kicking leg open enough to read as a low diagonal — hip, knee, and ankle don’t need to be one rigid straight line',
      severity: 'hint',
    });
  }

  return { passed: feedback.length === 0, feedback };
}

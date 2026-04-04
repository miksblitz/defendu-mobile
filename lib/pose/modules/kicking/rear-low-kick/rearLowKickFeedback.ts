/**
 * Rear low kick — feedback (MP left chain / mirrored preview ≈ rear leg).
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import {
  getIdx,
  inRearLowKickStrikePose,
  KICK_KNEE_INTERIOR_MAX_DEG,
  KICK_KNEE_INTERIOR_MIN_DEG,
  KICK_KNEE_MAX_CLEAR_ABOVE_HIP_Y,
  KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y,
  leftKneeInteriorAngleDeg,
  validPoint,
} from '../lead-low-kick/leadLowKickGeometry';

export function getRearLowKickFormFeedback(
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

  const kickingKneeTooHigh = (f: PoseFrame): boolean => {
    const hip = f[idx.lh];
    const knee = f[idx.lk];
    const ankle = f[idx.la];
    const sup = f[idx.ra];
    if (!validPoint(hip) || !validPoint(knee) || !validPoint(ankle) || !validPoint(sup)) return false;
    if (!(ankle.y <= sup.y - KICK_ANKLE_MIN_CLEAR_ABOVE_SUPPORT_Y)) return false;
    return knee.y < hip.y - KICK_KNEE_MAX_CLEAR_ABOVE_HIP_Y;
  };

  for (const f of userFrames) {
    if (inRearLowKickStrikePose(f, idx)) sawStrike = true;
    if (kickingKneeTooHigh(f)) sawHighKneeSwing = true;
    const a = leftKneeInteriorAngleDeg(f, idx);
    if (a != null) {
      chainMin = Math.min(chainMin, a);
      chainMax = Math.max(chainMax, a);
    }
  }

  const feedback: PoseFeedbackItem[] = [];
  if (!sawStrike) {
    feedback.push({
      id: 'rear-low-kick',
      message: sawHighKneeSwing
        ? 'Keep the knee below hip height — this is a low kick, not a raised knee / chamber'
        : 'Rear low kick: swing the rear leg out on a diagonal (on camera, usually the side toward the center of the frame). Hip to foot off the ground; a little knee bend is fine',
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

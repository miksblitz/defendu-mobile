/**
 * Lead high kick — form hints (left leg, knee/foot high, up–right diagonal).
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { getIdx, leftKneeInteriorAngleDeg } from '../lead-low-kick/leadLowKickGeometry';
import {
  inLeadHighKickStrikePose,
  HIGH_KICK_KNEE_INTERIOR_MIN_DEG,
  HIGH_KICK_KNEE_INTERIOR_MAX_DEG,
} from './leadHighKickGeometry';

export function getLeadHighKickFormFeedback(
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
  let chainMin = 400.0;
  let chainMax = -1.0;

  for (const f of userFrames) {
    if (inLeadHighKickStrikePose(f, idx)) sawStrike = true;
    const a = leftKneeInteriorAngleDeg(f, idx);
    if (a != null) {
      chainMin = Math.min(chainMin, a);
      chainMax = Math.max(chainMax, a);
    }
  }

  const feedback: PoseFeedbackItem[] = [];
  if (!sawStrike) {
    feedback.push({
      id: 'lead-high-kick',
      message:
        'Lead high kick (left leg): lift knee above hip and drive the foot up along a diagonal like \\ (up toward your right) — ankle toward the top of the line',
      severity: 'hint',
    });
  }
  if (chainMax >= 0 && (chainMin < HIGH_KICK_KNEE_INTERIOR_MIN_DEG || chainMax > HIGH_KICK_KNEE_INTERIOR_MAX_DEG)) {
    feedback.push({
      id: 'kick-leg-line',
      message: 'Keep the left leg open enough to read as a high diagonal kick',
      severity: 'hint',
    });
  }

  return { passed: feedback.length === 0, feedback };
}

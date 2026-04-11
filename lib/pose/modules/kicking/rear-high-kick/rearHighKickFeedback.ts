/**
 * Rear high kick — form hints (MP left chain / mirrored rear; knee and foot above hip).
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { getIdx, leftKneeInteriorAngleDeg } from '../lead-low-kick/leadLowKickGeometry';
import {
  HIGH_KICK_KNEE_INTERIOR_MAX_DEG,
  HIGH_KICK_KNEE_INTERIOR_MIN_DEG,
} from '../lead-high-kick/leadHighKickGeometry';
import { inRearHighKickStrikePose } from './rearHighKickGeometry';

export function getRearHighKickFormFeedback(
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
    if (inRearHighKickStrikePose(f, idx)) sawStrike = true;
    const a = leftKneeInteriorAngleDeg(f, idx);
    if (a != null) {
      chainMin = Math.min(chainMin, a);
      chainMax = Math.max(chainMax, a);
    }
  }

  const feedback: PoseFeedbackItem[] = [];
  if (!sawStrike) {
    feedback.push({
      id: 'rear-high-kick',
      message:
        'Rear high kick: lift the rear knee toward hip height or a bit higher and bring the leg up — imperfect form is okay; the leg doesn’t need to be straight or very high',
      severity: 'hint',
    });
  }
  if (chainMax >= 0 && (chainMin < HIGH_KICK_KNEE_INTERIOR_MIN_DEG || chainMax > HIGH_KICK_KNEE_INTERIOR_MAX_DEG)) {
    feedback.push({
      id: 'kick-leg-line',
      message:
        'A little more bend or opening in the kicking leg helps the camera see the movement — a bent knee or “not straight” leg is completely fine',
      severity: 'hint',
    });
  }

  return { passed: feedback.length === 0, feedback };
}

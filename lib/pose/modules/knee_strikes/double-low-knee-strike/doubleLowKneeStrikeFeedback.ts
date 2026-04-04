/**
 * Double low knee strike — form: right low chamber first, then left (same order as double high lead/rear).
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { getIdx, inLowLeadStrikePose } from '../low-lead-knee-strike/lowLeadKneeStrikeGeometry';
import { inLowRearStrikePose } from '../low-rear-knee-strike/lowRearKneeStrikeGeometry';

export function getDoubleLowKneeStrikeFormFeedback(
  userFrames: PoseFrame[]
): { passed: boolean; feedback: PoseFeedbackItem[] } {
  const idx = userFrames.length > 0 ? getIdx(userFrames[0]!) : null;
  if (!idx) {
    return {
      passed: false,
      feedback: [{ id: 'knee-landmarks', message: 'Hip/knee/ankle landmarks not detected clearly enough', severity: 'hint' }],
    };
  }

  let firstRight = -1;
  let firstLeft = -1;

  for (let i = 0; i < userFrames.length; i += 1) {
    const f = userFrames[i]!;
    if (firstRight < 0 && inLowLeadStrikePose(f, idx)) firstRight = i;
    if (firstLeft < 0 && inLowRearStrikePose(f, idx)) firstLeft = i;
  }

  const feedback: PoseFeedbackItem[] = [];
  if (firstRight < 0) {
    feedback.push({
      id: 'lead-right-low-knee',
      message: 'Start with your lead low knee (right: bent knee, staying on or below hip height)',
      severity: 'hint',
    });
  }
  if (firstLeft < 0) {
    feedback.push({
      id: 'rear-left-low-knee',
      message: 'Follow with your rear low knee (left: bent knee, staying on or below hip height)',
      severity: 'hint',
    });
  }
  if (firstRight >= 0 && firstLeft >= 0 && firstLeft < firstRight) {
    feedback.push({
      id: 'knee-order',
      message: 'Do the right low knee first, then the left',
      severity: 'warning',
    });
  }

  return { passed: feedback.length === 0, feedback };
}

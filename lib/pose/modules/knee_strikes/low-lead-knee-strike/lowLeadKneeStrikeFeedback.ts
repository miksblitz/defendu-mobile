/**
 * Low lead knee strike — form: knee stays on/below hip line + bent-knee window heuristics.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import {
  ANGLE_SHORT_REP_MEAN_MAX,
  ANGLE_SHORT_REP_MEAN_MIN,
  ANGLE_WINDOW,
  ANGLE_WINDOW_MEAN_MAX,
  ANGLE_WINDOW_MEAN_MIN,
  getIdx,
  inLowLeadStrikePose,
  rightKneeAngleDeg,
  rightKneeOnOrBelowMidHip,
} from './lowLeadKneeStrikeGeometry';

function angleFormPassed(angles: number[]): boolean {
  if (angles.length === 0) return false;
  if (angles.length >= ANGLE_WINDOW) {
    for (let i = 0; i + ANGLE_WINDOW <= angles.length; i += ANGLE_WINDOW) {
      const chunk = angles.slice(i, i + ANGLE_WINDOW);
      const m = chunk.reduce((s, x) => s + x, 0) / chunk.length;
      if (m >= ANGLE_WINDOW_MEAN_MIN && m <= ANGLE_WINDOW_MEAN_MAX) return true;
    }
  }
  const mean = angles.reduce((s, x) => s + x, 0) / angles.length;
  return mean >= ANGLE_SHORT_REP_MEAN_MIN && mean <= ANGLE_SHORT_REP_MEAN_MAX;
}

export function getLowLeadKneeStrikeFormFeedback(
  userFrames: PoseFrame[]
): { passed: boolean; feedback: PoseFeedbackItem[] } {
  const idx = userFrames.length > 0 ? getIdx(userFrames[0]!) : null;
  if (!idx) {
    return {
      passed: false,
      feedback: [{ id: 'knee-landmarks', message: 'Hip/knee/ankle landmarks not detected clearly enough', severity: 'hint' }],
    };
  }

  let sawStrikePose = false;
  let sawUnderHip = false;
  const angles: number[] = [];

  for (const f of userFrames) {
    if (inLowLeadStrikePose(f, idx)) sawStrikePose = true;
    if (rightKneeOnOrBelowMidHip(f, idx)) sawUnderHip = true;
    const a = rightKneeAngleDeg(f, idx);
    if (a != null) angles.push(a);
  }

  const feedback: PoseFeedbackItem[] = [];

  if (!sawUnderHip) {
    feedback.push({
      id: 'knee-under-hip',
      message: 'Keep your right knee on or below your hip line (don’t lift it above hip height)',
      severity: 'hint',
    });
  }

  if (!sawStrikePose) {
    feedback.push({
      id: 'low-lead-pose',
      message: 'Bend the right knee for a low chamber while staying under the hip line',
      severity: 'hint',
    });
  }

  if (!angleFormPassed(angles)) {
    feedback.push({
      id: 'knee-angle',
      message: 'Slightly more or less bend at the knee (stay under hip line)',
      severity: 'hint',
    });
  }

  return { passed: feedback.length === 0, feedback };
}

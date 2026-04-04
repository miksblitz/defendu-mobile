/**
 * High rear knee strike — distance for diagnostics; match follows form checks.
 */

import type { PoseFrame, PoseFeedbackItem, PoseSequence, PoseFocus } from '../../../types';
import { compareRepsWithFocus } from '../../../comparator';
import { getHighRearKneeStrikeFormFeedback } from './highRearKneeStrikeFeedback';

export function compareRepWithFeedbackHighRearKneeStrike(
  userFrames: PoseFrame[],
  referenceFrames: PoseSequence,
  _threshold: number = 0.2,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const form = getHighRearKneeStrikeFormFeedback(userFrames);
  const distance = referenceFrames.length > 0 ? compareRepsWithFocus(userFrames, referenceFrames, focus) : Infinity;
  const match = form.passed;
  const feedback: PoseFeedbackItem[] = match ? [] : form.feedback;
  return { match, distance, feedback };
}

export function compareRepWithFeedbackAnyHighRearKneeStrike(
  userFrames: PoseFrame[],
  referenceSequences: PoseSequence[],
  _threshold: number = 0.2,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  if (referenceSequences.length === 0) {
    return { match: true, distance: 0, feedback: [] };
  }

  const form = getHighRearKneeStrikeFormFeedback(userFrames);
  let bestDistance = Infinity;
  for (const ref of referenceSequences) {
    if (ref.length === 0) continue;
    const d = compareRepsWithFocus(userFrames, ref, focus);
    if (d < bestDistance) bestDistance = d;
  }

  const match = form.passed;
  const feedback: PoseFeedbackItem[] = match ? [] : form.feedback;
  return { match, distance: bestDistance, feedback };
}

/**
 * Low lead knee strike — rep validity comes from the detector (CSV-style lift + angle).
 * Comparator stays permissive on “perfect” so reference distance / strict form don’t block success UI.
 */

import type { PoseFrame, PoseFeedbackItem, PoseSequence, PoseFocus } from '../../../types';
import { compareRepsWithFocus } from '../../../comparator';

export function compareRepWithFeedbackLowLeadKneeStrike(
  userFrames: PoseFrame[],
  referenceFrames: PoseSequence,
  _threshold: number = 0.2,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance =
    referenceFrames.length > 0 ? compareRepsWithFocus(userFrames, referenceFrames, focus) : Infinity;
  return { match: true, distance, feedback: [] };
}

export function compareRepWithFeedbackAnyLowLeadKneeStrike(
  userFrames: PoseFrame[],
  referenceSequences: PoseSequence[],
  _threshold: number = 0.2,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  if (referenceSequences.length === 0) {
    return { match: true, distance: 0, feedback: [] };
  }

  let bestDistance = Infinity;
  for (const ref of referenceSequences) {
    if (ref.length === 0) continue;
    const d = compareRepsWithFocus(userFrames, ref, focus);
    if (d < bestDistance) bestDistance = d;
  }

  return { match: true, distance: bestDistance, feedback: [] };
}

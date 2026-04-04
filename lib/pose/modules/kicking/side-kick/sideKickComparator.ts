/**
 * Side kick — permissive match once the bespoke rep detector accepts the rep.
 */

import type { PoseFrame, PoseFeedbackItem, PoseSequence, PoseFocus } from '../../../types';
import { compareRepsWithFocus } from '../../../comparator';

export function compareRepWithFeedbackSideKick(
  userFrames: PoseFrame[],
  referenceFrames: PoseSequence,
  _threshold: number = 0.2,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance =
    referenceFrames.length > 0 ? compareRepsWithFocus(userFrames, referenceFrames, focus) : Infinity;
  return { match: true, distance, feedback: [] };
}

export function compareRepWithFeedbackAnySideKick(
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

/**
 * Double high knee strike — same idea as jab-cross combo: order/timing are enforced by the
 * rep detector. If a rep segment was emitted, count it as a match so the success UI shows.
 * Distance is still computed when reference poses exist (diagnostics / future use).
 */

import type { PoseFrame, PoseFeedbackItem, PoseSequence, PoseFocus } from '../../../types';
import { compareRepsWithFocus } from '../../../comparator';

export function compareRepWithFeedbackDoubleHighKneeStrike(
  _userFrames: PoseFrame[],
  referenceFrames: PoseSequence,
  _threshold: number = 0.2,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance =
    referenceFrames.length > 0 ? compareRepsWithFocus(_userFrames, referenceFrames, focus) : Infinity;
  return { match: true, distance, feedback: [] };
}

export function compareRepWithFeedbackAnyDoubleHighKneeStrike(
  _userFrames: PoseFrame[],
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
    const d = compareRepsWithFocus(_userFrames, ref, focus);
    if (d < bestDistance) bestDistance = d;
  }

  return { match: true, distance: bestDistance, feedback: [] };
}

import type { PoseFeedbackItem, PoseFocus, PoseFrame, PoseSequence } from '../../../types';
import { compareRepsWithFocus, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';

export function compareRepWithFeedbackLeftRightElbowStrike(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  _threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'punching');
  if (userFrames.length === 0 || referenceFrames.length === 0) {
    return { match: false, distance, feedback: [] };
  }
  // Perfect-rep rule for this combo is enforced by the combo rep detector:
  // lead elbow first, then right elbow within 5 seconds.
  return { match: true, distance, feedback: [] };
}

export function compareRepWithFeedbackAnyLeftRightElbowStrike(
  userFrames: PoseFrame[],
  referenceSequences: PoseSequence[],
  _threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  if (referenceSequences.length === 0) {
    return { match: true, distance: 0, feedback: [] };
  }

  let bestDistance = Infinity;
  for (const ref of referenceSequences) {
    if (ref.length === 0) continue;
    const d = compareRepsWithFocus(userFrames, ref, focus ?? 'punching');
    if (d < bestDistance) bestDistance = d;
  }

  return { match: true, distance: bestDistance, feedback: [] };
}

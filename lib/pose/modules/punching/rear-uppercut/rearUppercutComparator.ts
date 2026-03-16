/**
 * Rear uppercut comparison: distance-only match against the trained reference.
 */

import type { PoseFrame, PoseSequence, PoseFeedbackItem, PoseFocus } from '../../../types';
import { compareRepsWithFocus, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';

export function compareRepWithFeedbackRearUppercut(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  if (userFrames.length === 0 || referenceFrames.length === 0) {
    return { match: false, distance: Infinity, feedback: [] };
  }
  const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'punching');
  return { match: distance < threshold, distance, feedback: [] };
}

export function compareRepWithFeedbackAnyRearUppercut(
  userFrames: PoseFrame[],
  referenceSequences: PoseSequence[],
  threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  if (referenceSequences.length === 0 || userFrames.length === 0) {
    return { match: false, distance: Infinity, feedback: [] };
  }
  let bestDistance = Infinity;
  for (const ref of referenceSequences) {
    if (ref.length === 0) continue;
    const d = compareRepsWithFocus(userFrames, ref, focus ?? 'punching');
    if (d < threshold) return { match: true, distance: d, feedback: [] };
    if (d < bestDistance) bestDistance = d;
  }
  return { match: false, distance: bestDistance, feedback: [] };
}

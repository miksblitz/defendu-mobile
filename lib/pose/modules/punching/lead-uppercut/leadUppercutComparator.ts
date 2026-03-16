/**
 * Lead uppercut comparison: distance-only "template match" against the trained reference.
 * This treats the CSV-trained reference sequence as the definition of a perfect uppercut.
 */

import type { PoseFrame, PoseSequence, PoseFeedbackItem, PoseFocus } from '../../../types';
import { compareRepsWithFocus, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';

export function compareRepWithFeedbackLeadUppercut(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  if (userFrames.length === 0 || referenceFrames.length === 0) {
    return { match: false, distance: Infinity, feedback: [] };
  }
  const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'punching');
  const match = distance < threshold;
  return { match, distance, feedback: [] };
}

export function compareRepWithFeedbackAnyLeadUppercut(
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
    if (d < threshold) {
      return { match: true, distance: d, feedback: [] };
    }
    if (d < bestDistance) {
      bestDistance = d;
    }
  }
  return { match: false, distance: bestDistance, feedback: [] };
}


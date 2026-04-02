/**
 * Parry comparator: combines distance match and parry form checks.
 */

import type { PoseFrame, PoseSequence, PoseFeedbackItem, PoseFocus } from '../../../types';
import { compareRepsWithFocus } from '../../../comparator';
import { isParryFormAcceptable } from './parryFeedback';

export function compareRepWithFeedbackParry(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  threshold: number,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'full');
  if ((focus && focus !== 'full') || userFrames.length === 0 || referenceFrames.length === 0) {
    return { match: distance < threshold, distance, feedback: [] };
  }
  const formCheck = isParryFormAcceptable(userFrames, referenceFrames);
  return { match: distance < threshold && formCheck.acceptable, distance, feedback: formCheck.feedback };
}

export function compareRepWithFeedbackAnyParry(
  userFrames: PoseFrame[],
  referenceSequences: PoseSequence[],
  threshold: number,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  if (referenceSequences.length === 0) return { match: false, distance: Infinity, feedback: [] };
  let bestDistance = Infinity;
  let bestRef: PoseFrame[] = referenceSequences[0]!;

  for (const ref of referenceSequences) {
    if (ref.length === 0) continue;
    const d = compareRepsWithFocus(userFrames, ref, focus ?? 'full');
    const formCheck = isParryFormAcceptable(userFrames, ref);
    if (d < threshold && formCheck.acceptable) return { match: true, distance: d, feedback: [] };
    if (d < bestDistance) {
      bestDistance = d;
      bestRef = ref;
    }
  }

  const formCheck = isParryFormAcceptable(userFrames, bestRef);
  return { match: false, distance: bestDistance, feedback: formCheck.feedback };
}

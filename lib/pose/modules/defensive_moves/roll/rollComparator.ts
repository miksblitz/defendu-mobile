import type { PoseFrame, PoseSequence, PoseFeedbackItem, PoseFocus } from '../../../types';
import { compareRepsWithFocus } from '../../../comparator';
import { isRollFormAcceptable } from './rollFeedback';

export function compareRepWithFeedbackRoll(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  threshold: number,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'full');
  if ((focus && focus !== 'full') || userFrames.length === 0 || referenceFrames.length === 0) {
    return { match: distance < threshold, distance, feedback: [] };
  }
  const form = isRollFormAcceptable(userFrames, referenceFrames);
  return { match: distance < threshold && form.acceptable, distance, feedback: form.feedback };
}

export function compareRepWithFeedbackAnyRoll(
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
    const form = isRollFormAcceptable(userFrames, ref);
    if (d < threshold && form.acceptable) return { match: true, distance: d, feedback: [] };
    if (d < bestDistance) {
      bestDistance = d;
      bestRef = ref;
    }
  }
  const form = isRollFormAcceptable(userFrames, bestRef);
  return { match: false, distance: bestDistance, feedback: form.feedback };
}

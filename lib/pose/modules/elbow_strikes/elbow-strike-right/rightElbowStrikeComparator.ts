import type { PoseFeedbackItem, PoseFocus, PoseFrame, PoseSequence } from '../../../types';
import { compareRepsWithFocus, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { isRightElbowStrikeFormAcceptable } from './rightElbowStrikeFeedback';

export function compareRepWithFeedbackRightElbowStrike(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  _threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'punching');
  if (userFrames.length === 0 || referenceFrames.length === 0) {
    return { match: false, distance, feedback: [] };
  }
  const form = isRightElbowStrikeFormAcceptable(userFrames);
  return { match: form.acceptable, distance, feedback: form.feedback };
}

export function compareRepWithFeedbackAnyRightElbowStrike(
  userFrames: PoseFrame[],
  referenceSequences: PoseSequence[],
  _threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  if (referenceSequences.length === 0) {
    return { match: false, distance: Infinity, feedback: [] };
  }

  let bestDistance = Infinity;
  for (const ref of referenceSequences) {
    if (ref.length === 0) continue;
    const d = compareRepsWithFocus(userFrames, ref, focus ?? 'punching');
    if (d < bestDistance) bestDistance = d;
  }

  const form = isRightElbowStrikeFormAcceptable(userFrames);
  return { match: form.acceptable, distance: bestDistance, feedback: form.feedback };
}

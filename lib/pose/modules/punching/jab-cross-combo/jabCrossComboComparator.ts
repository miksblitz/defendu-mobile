import type { PoseFeedbackItem, PoseFocus, PoseFrame, PoseSequence } from '../../../types';

/**
 * Combo module: rep validity is enforced by the rep detector (jab then cross).
 * Comparator is intentionally permissive so a detected combo always counts.
 */
export function compareRepWithFeedbackJabCrossCombo(
  _userFrames: PoseFrame[],
  _referenceFrames: PoseFrame[],
  _threshold: number,
  _focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  return { match: true, distance: 0, feedback: [] };
}

export function compareRepWithFeedbackAnyJabCrossCombo(
  _userFrames: PoseFrame[],
  _referenceSequences: PoseSequence[],
  _threshold: number,
  _focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  return { match: true, distance: 0, feedback: [] };
}


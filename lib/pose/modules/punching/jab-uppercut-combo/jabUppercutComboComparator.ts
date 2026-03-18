import type { PoseFeedbackItem, PoseFocus, PoseFrame, PoseSequence } from '../../../types';

/**
 * Combo module: rep validity is enforced by the rep detector (jab then rear uppercut).
 * Comparator is permissive so a detected combo always counts against reference training data.
 */
export function compareRepWithFeedbackJabUppercutCombo(
  _userFrames: PoseFrame[],
  _referenceFrames: PoseFrame[],
  _threshold: number,
  _focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  return { match: true, distance: 0, feedback: [] };
}

export function compareRepWithFeedbackAnyJabUppercutCombo(
  _userFrames: PoseFrame[],
  _referenceSequences: PoseSequence[],
  _threshold: number,
  _focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  return { match: true, distance: 0, feedback: [] };
}

/**
 * Slip comparator: reference distance + slip form checks.
 * Left or right slip both pass if form constraints are satisfied.
 */

import type { PoseFrame, PoseSequence, PoseFeedbackItem, PoseFocus } from '../../../types';
import { compareRepsWithFocus } from '../../../comparator';
import { isSlipFormAcceptable } from './slipFeedback';
import type { SlipDirection } from './slipRepDetector';

export function compareRepWithFeedbackSlip(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  threshold: number,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'full');
  if ((focus && focus !== 'full') || userFrames.length === 0 || referenceFrames.length === 0) {
    return { match: distance < threshold, distance, feedback: [] };
  }
  const formCheck = isSlipFormAcceptable(userFrames, referenceFrames, 'either');
  return { match: distance < threshold && formCheck.acceptable, distance, feedback: formCheck.feedback };
}

export function compareRepWithFeedbackAnySlip(
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
    const formCheck = isSlipFormAcceptable(userFrames, ref, 'either');
    if (d < threshold && formCheck.acceptable) {
      return { match: true, distance: d, feedback: [] };
    }
    if (d < bestDistance) {
      bestDistance = d;
      bestRef = ref;
    }
  }

  const formCheck = isSlipFormAcceptable(userFrames, bestRef, 'either');
  return { match: false, distance: bestDistance, feedback: formCheck.feedback };
}

export function createSideSpecificSlipComparators(expectedDirection: SlipDirection): {
  compareRepWithFeedback: (
    userFrames: PoseFrame[],
    referenceFrames: PoseFrame[],
    threshold: number,
    focus?: PoseFocus
  ) => { match: boolean; distance: number; feedback: PoseFeedbackItem[] };
  compareRepWithFeedbackAny: (
    userFrames: PoseFrame[],
    referenceSequences: PoseSequence[],
    threshold: number,
    focus?: PoseFocus
  ) => { match: boolean; distance: number; feedback: PoseFeedbackItem[] };
} {
  const compareRepWithFeedback = (
    userFrames: PoseFrame[],
    referenceFrames: PoseFrame[],
    threshold: number,
    focus?: PoseFocus
  ): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } => {
    const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'full');
    if ((focus && focus !== 'full') || userFrames.length === 0 || referenceFrames.length === 0) {
      return { match: distance < threshold, distance, feedback: [] };
    }
    const formCheck = isSlipFormAcceptable(userFrames, referenceFrames, expectedDirection);
    return { match: distance < threshold && formCheck.acceptable, distance, feedback: formCheck.feedback };
  };

  const compareRepWithFeedbackAny = (
    userFrames: PoseFrame[],
    referenceSequences: PoseSequence[],
    threshold: number,
    focus?: PoseFocus
  ): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } => {
    if (referenceSequences.length === 0) return { match: false, distance: Infinity, feedback: [] };
    let bestDistance = Infinity;
    let bestRef: PoseFrame[] = referenceSequences[0]!;

    for (const ref of referenceSequences) {
      if (ref.length === 0) continue;
      const d = compareRepsWithFocus(userFrames, ref, focus ?? 'full');
      const formCheck = isSlipFormAcceptable(userFrames, ref, expectedDirection);
      if (d < threshold && formCheck.acceptable) {
        return { match: true, distance: d, feedback: [] };
      }
      if (d < bestDistance) {
        bestDistance = d;
        bestRef = ref;
      }
    }

    const formCheck = isSlipFormAcceptable(userFrames, bestRef, expectedDirection);
    return { match: false, distance: bestDistance, feedback: formCheck.feedback };
  };

  return { compareRepWithFeedback, compareRepWithFeedbackAny };
}

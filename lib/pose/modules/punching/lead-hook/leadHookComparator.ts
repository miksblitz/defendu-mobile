/**
 * Lead hook comparison: match only when left (hook) extends, right in guard.
 * Uses main comparator for distance; uses lead hook feedback for form rules.
 */

import type { PoseFrame, PoseSequence, PoseFeedbackItem, PoseFocus } from '../../../types';
import { compareRepsWithFocus, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { detectJabPhases } from '../../../phaseDetection';
import { isImpactFormAcceptableLeadHook } from './leadHookFeedback';

export function compareRepWithFeedbackLeadHook(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'punching');
  if (focus !== 'punching' || userFrames.length === 0 || referenceFrames.length === 0) {
    return { match: distance < threshold, distance, feedback: [] };
  }
  const refBounds = detectJabPhases(referenceFrames);
  const impactCheck = isImpactFormAcceptableLeadHook(userFrames, referenceFrames, refBounds);
  const match = distance < threshold && impactCheck.acceptable;
  return { match, distance, feedback: impactCheck.feedback };
}

export function compareRepWithFeedbackAnyLeadHook(
  userFrames: PoseFrame[],
  referenceSequences: PoseSequence[],
  threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  if (referenceSequences.length === 0) {
    return { match: false, distance: Infinity, feedback: [] };
  }
  let bestDistance = Infinity;
  let bestRef: PoseFrame[] = referenceSequences[0]!;
  for (const ref of referenceSequences) {
    if (ref.length > 0) {
      const d = compareRepsWithFocus(userFrames, ref, focus ?? 'punching');
      const refBounds = detectJabPhases(ref);
      const impactCheck = isImpactFormAcceptableLeadHook(userFrames, ref, refBounds);
      if (d < threshold && impactCheck.acceptable) {
        return { match: true, distance: d, feedback: [] };
      }
      if (d < bestDistance) {
        bestDistance = d;
        bestRef = ref;
      }
    }
  }
  const refBounds = detectJabPhases(bestRef);
  const impactCheck = isImpactFormAcceptableLeadHook(userFrames, bestRef, refBounds);
  return { match: false, distance: bestDistance, feedback: impactCheck.feedback };
}

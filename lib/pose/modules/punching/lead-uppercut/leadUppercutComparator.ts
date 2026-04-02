/**
 * Lead uppercut comparison: template distance + uppercut-specific impact form checks.
 */

import type { PoseFrame, PoseSequence, PoseFeedbackItem, PoseFocus } from '../../../types';
import { compareRepsWithFocus, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { detectJabPhases } from '../../../phaseDetection';
import { isImpactFormAcceptableLeadUppercut } from './leadUppercutFeedback';

export function compareRepWithFeedbackLeadUppercut(
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
  const impactCheck = isImpactFormAcceptableLeadUppercut(userFrames, referenceFrames, refBounds);
  const relaxedThreshold = threshold + 0.08;
  const match = distance < relaxedThreshold && impactCheck.acceptable;
  return { match, distance, feedback: impactCheck.feedback };
}

export function compareRepWithFeedbackAnyLeadUppercut(
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
    if (ref.length === 0) continue;
    const d = compareRepsWithFocus(userFrames, ref, focus ?? 'punching');
    const refBounds = detectJabPhases(ref);
    const impactCheck = isImpactFormAcceptableLeadUppercut(userFrames, ref, refBounds);
    const relaxedThreshold = threshold + 0.08;
    if (d < relaxedThreshold && impactCheck.acceptable) {
      return { match: true, distance: d, feedback: [] };
    }
    if (d < bestDistance) {
      bestDistance = d;
      bestRef = ref;
    }
  }
  const refBounds = detectJabPhases(bestRef);
  const impactCheck = isImpactFormAcceptableLeadUppercut(userFrames, bestRef, refBounds);
  return { match: false, distance: bestDistance, feedback: impactCheck.feedback };
}

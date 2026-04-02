import type { PoseFrame, PoseFeedbackItem, PoseSequence, PoseFocus } from '../../../types';
import { compareRepsWithFocus, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { detectJabPhases } from '../../../phaseDetection';
import { isImpactFormAcceptableLeadUppercutElbowStrike } from './leadUppercutElbowStrikeFeedback';
export function compareRepWithFeedbackLeadUppercutElbowStrike(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  threshold: number = PUNCHING_MATCH_THRESHOLD,
  focus?: PoseFocus
): { match: boolean; distance: number; feedback: PoseFeedbackItem[] } {
  const distance = compareRepsWithFocus(userFrames, referenceFrames, focus ?? 'punching');
  if (userFrames.length === 0 || referenceFrames.length === 0) {
    return { match: false, distance, feedback: [] };
  }
  const refBounds = detectJabPhases(referenceFrames);
  const form = isImpactFormAcceptableLeadUppercutElbowStrike(userFrames, referenceFrames, refBounds);
  return { match: form.acceptable, distance, feedback: form.feedback };
}
export function compareRepWithFeedbackAnyLeadUppercutElbowStrike(
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
    if (d < bestDistance) {
      bestDistance = d;
      bestRef = ref;
    }
  }
  const refBounds = detectJabPhases(bestRef);
  const form = isImpactFormAcceptableLeadUppercutElbowStrike(userFrames, bestRef, refBounds);
  return { match: form.acceptable, distance: bestDistance, feedback: form.feedback };
}

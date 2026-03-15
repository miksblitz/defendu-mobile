/**
 * Orthodox jab comparison: match only when left extends, right in guard (stricter form).
 * Uses main comparator for distance; uses jab feedback for orthodox form rules.
 */

import type { PoseFrame, PoseSequence, PoseFeedbackItem, PoseFocus } from '../../../types';
import { compareRepsWithFocus, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { detectJabPhases } from '../../../phaseDetection';
import { isImpactFormAcceptableOrthodox } from './jabFeedback';

/**
 * Orthodox jab: compare rep with stricter form (left extends, right in guard only).
 * Match only if distance below threshold AND orthodox impact form is acceptable.
 */
export function compareRepWithFeedbackOrthodox(
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
  const impactCheck = isImpactFormAcceptableOrthodox(userFrames, referenceFrames, refBounds);
  const match = distance < threshold && impactCheck.acceptable;
  return { match, distance, feedback: impactCheck.feedback };
}

/**
 * Orthodox jab: match if any reference passes distance AND orthodox form (left jab, right guard).
 */
export function compareRepWithFeedbackAnyOrthodox(
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
      const impactCheck = isImpactFormAcceptableOrthodox(userFrames, ref, refBounds);
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
  const impactCheck = isImpactFormAcceptableOrthodox(userFrames, bestRef, refBounds);
  return { match: false, distance: bestDistance, feedback: impactCheck.feedback };
}

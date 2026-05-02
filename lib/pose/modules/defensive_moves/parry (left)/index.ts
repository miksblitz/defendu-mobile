/**
 * Parry-LEFT pipeline (defensive moves):
 * Only the user's LEFT arm counts as a perfect rep. A parry performed with
 * the right arm is forced into a "WRONG ARM!" bad rep.
 *
 * NOTE: `expectedSide='right'` here intentionally points at the model's
 * RIGHT-side landmarks (16/14/12, etc.) because the camera feed is mirrored
 * (selfie view), so the model's right corresponds to the user's left arm.
 * The legacy export names still say "Right" — they're the names the registry
 * imports, and renaming them is a wider refactor.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { createParryRepDetectorForSide } from './parryRepDetector';
import { createSideSpecificParryComparators } from './parryComparator';

const poseFocus: PoseFocus = 'full';
const PARRY_MATCH_THRESHOLD = 0.24;

export const PARRY_RIGHT_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775654919396';
export const PARRY_RIGHT_MODULE_REGISTRY_KEY = `defensive_moves/${PARRY_RIGHT_MODULE_ID}`;
const rightComparators = createSideSpecificParryComparators('right');

export const defensiveParryRightPipeline: ModulePosePipeline = {
  createRepDetector: () => createParryRepDetectorForSide('right'),
  compareRepWithFeedback: rightComparators.compareRepWithFeedback,
  compareRepWithFeedbackAny: rightComparators.compareRepWithFeedbackAny,
  defaultMatchThreshold: PARRY_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 4,
};

export { createParryRepDetector, createParryRepDetectorForSide } from './parryRepDetector';
export { getParryFeedback, isParryFormAcceptable } from './parryFeedback';
export {
  compareRepWithFeedbackParry,
  compareRepWithFeedbackAnyParry,
  createSideSpecificParryComparators,
} from './parryComparator';

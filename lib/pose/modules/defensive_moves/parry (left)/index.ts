/**
 * Parry-LEFT pipeline (defensive moves):
 * Only the LEFT arm counts as a perfect rep. A parry performed with the
 * right arm is forced into a "WRONG ARM!" bad rep.
 *
 * NOTE: the legacy export names below still say "Right" — they are the names
 * the registry imports, and renaming them is a wider refactor. The actual
 * Firebase module they are wired to is the parry-LEFT drill.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { createParryRepDetectorForSide } from './parryRepDetector';
import { createSideSpecificParryComparators } from './parryComparator';

const poseFocus: PoseFocus = 'full';
const PARRY_MATCH_THRESHOLD = 0.24;

export const PARRY_RIGHT_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775654919396';
export const PARRY_RIGHT_MODULE_REGISTRY_KEY = `defensive_moves/${PARRY_RIGHT_MODULE_ID}`;
const leftComparators = createSideSpecificParryComparators('left');

export const defensiveParryRightPipeline: ModulePosePipeline = {
  createRepDetector: () => createParryRepDetectorForSide('left'),
  compareRepWithFeedback: leftComparators.compareRepWithFeedback,
  compareRepWithFeedbackAny: leftComparators.compareRepWithFeedbackAny,
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

/**
 * Parry pipeline (defensive moves):
 * either left or right arm parry can count as perfect rep.
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

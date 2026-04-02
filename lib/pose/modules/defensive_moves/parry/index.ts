/**
 * Parry pipeline (defensive moves):
 * either left or right arm parry can count as perfect rep.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { createParryRepDetector } from './parryRepDetector';
import { compareRepWithFeedbackParry, compareRepWithFeedbackAnyParry } from './parryComparator';

const poseFocus: PoseFocus = 'full';
const PARRY_MATCH_THRESHOLD = 0.24;

export const PARRY_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774762044307';
export const PARRY_MODULE_REGISTRY_KEY = `defensive_moves/${PARRY_MODULE_ID}`;

export const defensiveParryPipeline: ModulePosePipeline = {
  createRepDetector: () => createParryRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackParry,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyParry,
  defaultMatchThreshold: PARRY_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 4,
};

export { createParryRepDetector } from './parryRepDetector';
export { getParryFeedback, isParryFormAcceptable } from './parryFeedback';
export { compareRepWithFeedbackParry, compareRepWithFeedbackAnyParry } from './parryComparator';

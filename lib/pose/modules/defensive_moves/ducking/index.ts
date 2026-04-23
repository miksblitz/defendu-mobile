/**
 * Ducking maneuver pipeline:
 * detect standing-up vs standing-down with guard maintained.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { createDuckingRepDetector } from './duckingRepDetector';
import {
  compareRepWithFeedbackDucking,
  compareRepWithFeedbackAnyDucking,
} from './duckingComparator';

const poseFocus: PoseFocus = 'full';
const DUCKING_MATCH_THRESHOLD = 0.25;

export const DUCKING_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774761598392';
export const DUCKING_MODULE_REGISTRY_KEY = `defensive_moves/${DUCKING_MODULE_ID}`;

export const defensiveDuckingPipeline: ModulePosePipeline = {
  createRepDetector: () => createDuckingRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackDucking,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyDucking,
  defaultMatchThreshold: DUCKING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

export { createDuckingRepDetector } from './duckingRepDetector';
export { getDuckingFeedback, isDuckingFormAcceptable } from './duckingFeedback';
export {
  compareRepWithFeedbackDucking,
  compareRepWithFeedbackAnyDucking,
} from './duckingComparator';

/**
 * Slip + duck pipeline: lateral slip with stable hips, then duck with guard up.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { createSlipDuckRepDetector } from './slipDuckRepDetector';
import {
  compareRepWithFeedbackSlipDuck,
  compareRepWithFeedbackAnySlipDuck,
} from './slipDuckComparator';

const poseFocus: PoseFocus = 'full';
const SLIP_DUCK_MATCH_THRESHOLD = 0.25;

export const SLIP_DUCK_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774890300372';
export const SLIP_DUCK_MODULE_REGISTRY_KEY = `defensive_moves/${SLIP_DUCK_MODULE_ID}`;

export const defensiveSlipDuckPipeline: ModulePosePipeline = {
  createRepDetector: () => createSlipDuckRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackSlipDuck,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnySlipDuck,
  defaultMatchThreshold: SLIP_DUCK_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 7,
};

export { createSlipDuckRepDetector } from './slipDuckRepDetector';
export { getSlipDuckFeedback, isSlipDuckFormAcceptable } from './slipDuckFeedback';
export {
  compareRepWithFeedbackSlipDuck,
  compareRepWithFeedbackAnySlipDuck,
} from './slipDuckComparator';

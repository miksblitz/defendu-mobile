/**
 * Slip pipeline (defensive moves):
 * upper body moves off centerline left/right while hips stay stable.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { createSlipRepDetectorForDirection } from './slipRepDetector';
import { createSideSpecificSlipComparators } from './slipComparator';

const poseFocus: PoseFocus = 'full';
const SLIP_MATCH_THRESHOLD = 0.24;

export const SLIP_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774456878405';
export const SLIP_MODULE_REGISTRY_KEY = `defensive_moves/${SLIP_MODULE_ID}`;

const slipComparators = createSideSpecificSlipComparators('either');

export const defensiveSlipPipeline: ModulePosePipeline = {
  createRepDetector: () => createSlipRepDetectorForDirection('either'),
  compareRepWithFeedback: slipComparators.compareRepWithFeedback,
  compareRepWithFeedbackAny: slipComparators.compareRepWithFeedbackAny,
  defaultMatchThreshold: SLIP_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

export { createSlipRepDetector, createSlipRepDetectorForDirection } from './slipRepDetector';
export { getSlipFeedback, isSlipFormAcceptable } from './slipFeedback';
export {
  compareRepWithFeedbackSlip,
  compareRepWithFeedbackAnySlip,
  createSideSpecificSlipComparators,
} from './slipComparator';

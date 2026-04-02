/**
 * Slip pipeline (defensive moves):
 * upper body moves off centerline left/right while hips stay stable.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { createSlipRepDetector } from './slipRepDetector';
import { compareRepWithFeedbackSlip, compareRepWithFeedbackAnySlip } from './slipComparator';

const poseFocus: PoseFocus = 'full';
const SLIP_MATCH_THRESHOLD = 0.24;

export const SLIP_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774456878405';
export const SLIP_MODULE_REGISTRY_KEY = `defensive_moves/${SLIP_MODULE_ID}`;

export const defensiveSlipPipeline: ModulePosePipeline = {
  createRepDetector: () => createSlipRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackSlip,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnySlip,
  defaultMatchThreshold: SLIP_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 4,
};

export { createSlipRepDetector } from './slipRepDetector';
export { getSlipFeedback, isSlipFormAcceptable } from './slipFeedback';
export { compareRepWithFeedbackSlip, compareRepWithFeedbackAnySlip } from './slipComparator';

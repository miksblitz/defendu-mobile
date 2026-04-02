/**
 * Slip + opposite-hand parry (Firebase module …72612042, registry key still "roll" path).
 * Slip left → parry right; slip right → parry left.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { createSlipParryRepDetector } from './rollRepDetector';
import { compareRepWithFeedbackRoll, compareRepWithFeedbackAnyRoll } from './rollComparator';

const poseFocus: PoseFocus = 'full';
/** Distance threshold for reference matching; tune with new reference captures. */
const SLIP_PARRY_MATCH_THRESHOLD = 0.28;

export const ROLL_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774762612042';
export const ROLL_MODULE_REGISTRY_KEY = `defensive_moves/${ROLL_MODULE_ID}`;

export const defensiveRollPipeline: ModulePosePipeline = {
  createRepDetector: () => createSlipParryRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackRoll,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyRoll,
  defaultMatchThreshold: SLIP_PARRY_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 7,
};

export { createSlipParryRepDetector, createRollRepDetector } from './rollRepDetector';
export { getRollFeedback, isRollFormAcceptable } from './rollFeedback';
export { compareRepWithFeedbackRoll, compareRepWithFeedbackAnyRoll } from './rollComparator';

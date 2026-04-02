/**
 * Block module pipeline: normal stance -> blocking defensive movement.
 * Uses full-body reference matching with a module-specific threshold.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { createBlockRepDetector } from './blockRepDetector';
import { compareRepWithFeedbackBlock, compareRepWithFeedbackAnyBlock } from './blockComparator';

const poseFocus: PoseFocus = 'full';
const BLOCK_MATCH_THRESHOLD = 0.22;
export const BLOCK_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774761110101';
export const BLOCK_MODULE_REGISTRY_KEY = `defensive_moves/${BLOCK_MODULE_ID}`;

export const defensiveBlockPipeline: ModulePosePipeline = {
  createRepDetector: () => createBlockRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackBlock,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyBlock,
  defaultMatchThreshold: BLOCK_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 5,
};

export { createBlockRepDetector } from './blockRepDetector';
export { getBlockFeedback, isBlockFormAcceptable } from './blockFeedback';
export { compareRepWithFeedbackBlock, compareRepWithFeedbackAnyBlock } from './blockComparator';

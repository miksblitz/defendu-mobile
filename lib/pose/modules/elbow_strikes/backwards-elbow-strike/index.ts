/**
 * Backwards elbow strike pipeline.
 * Final pose: left elbow drives backward behind the shoulder.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createBackwardsElbowStrikeRepDetector } from './backwardsElbowStrikeRepDetector';
import {
  compareRepWithFeedbackAnyBackwardsElbowStrike,
  compareRepWithFeedbackBackwardsElbowStrike,
} from './backwardsElbowStrikeComparator';

export const BACKWARDS_ELBOW_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774766097511';
export const BACKWARDS_ELBOW_STRIKE_REGISTRY_KEY = `elbow_strikes/${BACKWARDS_ELBOW_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'punching';

export const backwardsElbowStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createBackwardsElbowStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackBackwardsElbowStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyBackwardsElbowStrike,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 1,
};

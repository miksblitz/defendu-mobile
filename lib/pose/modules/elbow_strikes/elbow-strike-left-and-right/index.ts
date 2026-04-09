/**
 * Elbow Strike (Left and Right) combo.
 * Required sequence:
 * 1) Lead elbow strike
 * 2) Right elbow strike within 5 seconds
 * If step 2 is not completed in 5 seconds, it is not a perfect rep.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createLeftRightElbowStrikeRepDetector } from './leftRightElbowStrikeRepDetector';
import {
  compareRepWithFeedbackLeftRightElbowStrike,
  compareRepWithFeedbackAnyLeftRightElbowStrike,
} from './leftRightElbowStrikeComparator';

export const LEFT_RIGHT_ELBOW_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774765697890';
export const LEFT_RIGHT_ELBOW_STRIKE_REGISTRY_KEY = `elbow_strikes/${LEFT_RIGHT_ELBOW_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'punching';

export const leftRightElbowStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createLeftRightElbowStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackLeftRightElbowStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyLeftRightElbowStrike,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 1,
};


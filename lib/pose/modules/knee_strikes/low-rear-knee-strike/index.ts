/**
 * Low rear knee strike (left leg).
 */

import type { ModulePosePipeline } from '../../types';
import { createLowRearKneeStrikeRepDetector } from './lowRearKneeStrikeRepDetector';
import {
  compareRepWithFeedbackAnyLowRearKneeStrike,
  compareRepWithFeedbackLowRearKneeStrike,
} from './lowRearKneeStrikeComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const LOW_REAR_KNEE_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775199106452';
export const LOW_REAR_KNEE_STRIKE_REGISTRY_KEY = `knee_strikes/${LOW_REAR_KNEE_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const lowRearKneeStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createLowRearKneeStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackLowRearKneeStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyLowRearKneeStrike,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

/**
 * High rear knee strike.
 */

import type { ModulePosePipeline } from '../../types';
import { createHighRearKneeStrikeRepDetector } from './highRearKneeStrikeRepDetector';
import {
  compareRepWithFeedbackAnyHighRearKneeStrike,
  compareRepWithFeedbackHighRearKneeStrike,
} from './highRearKneeStrikeComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const HIGH_REAR_KNEE_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775200322520';
export const HIGH_REAR_KNEE_STRIKE_REGISTRY_KEY = `knee_strikes/${HIGH_REAR_KNEE_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const highRearKneeStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createHighRearKneeStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackHighRearKneeStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyHighRearKneeStrike,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

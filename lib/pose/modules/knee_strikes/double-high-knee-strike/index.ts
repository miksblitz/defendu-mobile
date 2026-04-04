/**
 * Double high knee strike.
 */

import type { ModulePosePipeline } from '../../types';
import { createDoubleHighKneeStrikeRepDetector } from './doubleHighKneeStrikeRepDetector';
import {
  compareRepWithFeedbackAnyDoubleHighKneeStrike,
  compareRepWithFeedbackDoubleHighKneeStrike,
} from './doubleHighKneeStrikeComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const DOUBLE_HIGH_KNEE_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775200765021';
export const DOUBLE_HIGH_KNEE_STRIKE_REGISTRY_KEY = `knee_strikes/${DOUBLE_HIGH_KNEE_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const doubleHighKneeStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createDoubleHighKneeStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackDoubleHighKneeStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyDoubleHighKneeStrike,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

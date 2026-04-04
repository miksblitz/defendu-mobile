/**
 * High lead knee strike.
 */

import type { ModulePosePipeline } from '../../types';
import { createHighLeadKneeStrikeRepDetector } from './highLeadKneeStrikeRepDetector';
import {
  compareRepWithFeedbackHighLeadKneeStrike,
  compareRepWithFeedbackAnyHighLeadKneeStrike,
} from './highLeadKneeStrikeComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const HIGH_LEAD_KNEE_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775199277970';
export const HIGH_LEAD_KNEE_STRIKE_REGISTRY_KEY = `knee_strikes/${HIGH_LEAD_KNEE_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const highLeadKneeStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createHighLeadKneeStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackHighLeadKneeStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyHighLeadKneeStrike,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

/**
 * Low lead knee strike.
 */

import type { ModulePosePipeline } from '../../types';
import { createLowLeadKneeStrikeRepDetector } from './lowLeadKneeStrikeRepDetector';
import {
  compareRepWithFeedbackAnyLowLeadKneeStrike,
  compareRepWithFeedbackLowLeadKneeStrike,
} from './lowLeadKneeStrikeComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const LOW_LEAD_KNEE_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775198970210';
export const LOW_LEAD_KNEE_STRIKE_REGISTRY_KEY = `knee_strikes/${LOW_LEAD_KNEE_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const lowLeadKneeStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createLowLeadKneeStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackLowLeadKneeStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyLowLeadKneeStrike,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

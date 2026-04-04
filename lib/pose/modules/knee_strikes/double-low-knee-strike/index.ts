/**
 * Double low knee strike — right low chamber, then left, within timing window.
 */

import type { ModulePosePipeline } from '../../types';
import { createDoubleLowKneeStrikeRepDetector } from './doubleLowKneeStrikeRepDetector';
import {
  compareRepWithFeedbackAnyDoubleLowKneeStrike,
  compareRepWithFeedbackDoubleLowKneeStrike,
} from './doubleLowKneeStrikeComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const DOUBLE_LOW_KNEE_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775200693370';
export const DOUBLE_LOW_KNEE_STRIKE_REGISTRY_KEY = `knee_strikes/${DOUBLE_LOW_KNEE_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const doubleLowKneeStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createDoubleLowKneeStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackDoubleLowKneeStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyDoubleLowKneeStrike,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

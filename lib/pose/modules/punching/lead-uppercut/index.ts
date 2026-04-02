/**
 * Lead uppercut pipeline: user's LEFT hand throws the uppercut, user's RIGHT hand in guard.
 * Uses uppercut-specific detection/comparison/feedback for punching.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createLeadUppercutRepDetector } from './leadUppercutRepDetector';
import {
  compareRepWithFeedbackLeadUppercut,
  compareRepWithFeedbackAnyLeadUppercut,
} from './leadUppercutComparator';

const poseFocus: PoseFocus = 'punching';

export const leadUppercutPipeline: ModulePosePipeline = {
  createRepDetector: () => createLeadUppercutRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackLeadUppercut,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyLeadUppercut,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 5,
};

export {
  compareRepWithFeedbackLeadUppercut,
  compareRepWithFeedbackAnyLeadUppercut,
} from './leadUppercutComparator';

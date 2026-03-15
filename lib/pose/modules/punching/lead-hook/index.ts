/**
 * Lead hook pipeline: user's LEFT hand throws the hook, user's RIGHT hand in guard.
 * Same arm assignment as orthodox jab. Used by Lead Hook Test module (Firebase).
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createLeadHookRepDetector } from './leadHookRepDetector';
import {
  compareRepWithFeedbackLeadHook,
  compareRepWithFeedbackAnyLeadHook,
} from './leadHookComparator';

const poseFocus: PoseFocus = 'punching';

export const leadHookPipeline: ModulePosePipeline = {
  createRepDetector: () => createLeadHookRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackLeadHook,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyLeadHook,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 5,
};

export { createLeadHookRepDetector } from './leadHookRepDetector';
export { getLeadHookFeedback, isImpactFormAcceptableLeadHook } from './leadHookFeedback';
export { compareRepWithFeedbackLeadHook, compareRepWithFeedbackAnyLeadHook } from './leadHookComparator';

/**
 * Cross jab pipeline: user's RIGHT hand punches, user's LEFT hand in guard.
 * Mirror of lead/orthodox jab (which use left punch, right guard).
 * Used by Cross Jab Test module (built-in and optional reference-trained).
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createCrossJabRepDetector } from './crossJabRepDetector';
import {
  compareRepWithFeedbackCross,
  compareRepWithFeedbackAnyCross,
} from './crossJabComparator';

const poseFocus: PoseFocus = 'punching';

export const crossJabPipeline: ModulePosePipeline = {
  createRepDetector: () => createCrossJabRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackCross,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyCross,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 5,
};

export { createCrossJabRepDetector } from './crossJabRepDetector';
export { getJabFeedbackCross, isImpactFormAcceptableCross } from './crossJabFeedback';
export { compareRepWithFeedbackCross, compareRepWithFeedbackAnyCross } from './crossJabComparator';

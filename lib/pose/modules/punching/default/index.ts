/**
 * Default punching module pipeline: comparator, rep detector, threshold.
 * Used for any punching module that does not have its own folder (e.g. jab-tester, or Firebase punching modules).
 */

import type { ModulePosePipeline } from '../../types';
import { compareRepWithFeedback, compareRepWithFeedbackAny, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createRepDetector } from '../../../repDetector';
import type { PoseFocus } from '../../../types';

const poseFocus: PoseFocus = 'punching';

export const punchingDefaultPipeline: ModulePosePipeline = {
  createRepDetector: () => createRepDetector(poseFocus),
  compareRepWithFeedback,
  compareRepWithFeedbackAny,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 5,
};

/**
 * Default elbow strikes module pipeline (upper-body striking focus).
 */

import type { ModulePosePipeline } from '../../types';
import { compareRepWithFeedback, compareRepWithFeedbackAny, PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createRepDetector } from '../../../repDetector';
import type { PoseFocus } from '../../../types';

const poseFocus: PoseFocus = 'punching';

export const elbowStrikesDefaultPipeline: ModulePosePipeline = {
  createRepDetector: () => createRepDetector(poseFocus),
  compareRepWithFeedback,
  compareRepWithFeedbackAny,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 5,
};

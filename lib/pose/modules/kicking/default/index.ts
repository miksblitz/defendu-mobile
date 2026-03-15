/**
 * Default kicking module pipeline.
 */

import type { ModulePosePipeline } from '../../types';
import { compareRepWithFeedback, compareRepWithFeedbackAny, DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import { createRepDetector } from '../../../repDetector';
import type { PoseFocus } from '../../../types';

const poseFocus: PoseFocus = 'kicking';

export const kickingDefaultPipeline: ModulePosePipeline = {
  createRepDetector: () => createRepDetector(poseFocus),
  compareRepWithFeedback,
  compareRepWithFeedbackAny,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 5,
};

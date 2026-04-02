/**
 * Rear uppercut elbow strike pipeline.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createRearUppercutElbowStrikeRepDetector } from './rearUppercutElbowStrikeRepDetector';
import {
  compareRepWithFeedbackRearUppercutElbowStrike,
  compareRepWithFeedbackAnyRearUppercutElbowStrike,
} from './rearUppercutElbowStrikeComparator';

const poseFocus: PoseFocus = 'punching';

export const rearUppercutElbowStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createRearUppercutElbowStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackRearUppercutElbowStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyRearUppercutElbowStrike,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 1,
};


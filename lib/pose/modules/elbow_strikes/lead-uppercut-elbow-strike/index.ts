/**
 * Lead uppercut elbow strike pipeline:
 * guard_stance -> transition -> elbowstrikefinalposition -> guard_stance
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createLeadUppercutElbowStrikeRepDetectorStrict } from './leadUppercutElbowStrikeRepDetectorStrict';
import {
  compareRepWithFeedbackLeadUppercutElbowStrikeStrict,
  compareRepWithFeedbackAnyLeadUppercutElbowStrikeStrict,
} from './leadUppercutElbowStrikeComparatorStrict';

const poseFocus: PoseFocus = 'punching';

export const leadUppercutElbowStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createLeadUppercutElbowStrikeRepDetectorStrict(),
  compareRepWithFeedback: compareRepWithFeedbackLeadUppercutElbowStrikeStrict,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyLeadUppercutElbowStrikeStrict,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 1,
};


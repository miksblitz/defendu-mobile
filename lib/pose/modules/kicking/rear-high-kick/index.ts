/**
 * Rear high kick — MP left leg chain (mirrored selfie ≈ orthodox rear leg; opposite chain to lead high kick).
 */

import type { ModulePosePipeline } from '../../types';
import { createRearHighKickRepDetector } from './rearHighKickRepDetector';
import {
  compareRepWithFeedbackAnyRearHighKick,
  compareRepWithFeedbackRearHighKick,
} from './rearHighKickComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const REAR_HIGH_KICK_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775200512643';
export const REAR_HIGH_KICK_REGISTRY_KEY = `kicking/${REAR_HIGH_KICK_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const rearHighKickPipeline: ModulePosePipeline = {
  createRepDetector: () => createRearHighKickRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackRearHighKick,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyRearHighKick,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

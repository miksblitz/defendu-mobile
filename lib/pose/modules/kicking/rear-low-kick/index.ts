/**
 * Rear low kick — MP left leg chain (mirrored selfie ≈ orthodox rear leg).
 */

import type { ModulePosePipeline } from '../../types';
import { createRearLowKickRepDetector } from './rearLowKickRepDetector';
import {
  compareRepWithFeedbackAnyRearLowKick,
  compareRepWithFeedbackRearLowKick,
} from './rearLowKickComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const REAR_LOW_KICK_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775198609371';
export const REAR_LOW_KICK_REGISTRY_KEY = `kicking/${REAR_LOW_KICK_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const rearLowKickPipeline: ModulePosePipeline = {
  createRepDetector: () => createRearLowKickRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackRearLowKick,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyRearLowKick,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

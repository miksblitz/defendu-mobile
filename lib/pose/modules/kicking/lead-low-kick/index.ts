/**
 * Lead low kick — MP right leg chain (mirrored selfie ≈ orthodox lead leg).
 */

import type { ModulePosePipeline } from '../../types';
import { createLeadLowKickRepDetector } from './leadLowKickRepDetector';
import {
  compareRepWithFeedbackAnyLeadLowKick,
  compareRepWithFeedbackLeadLowKick,
} from './leadLowKickComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const LEAD_LOW_KICK_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775198142670';
export const LEAD_LOW_KICK_REGISTRY_KEY = `kicking/${LEAD_LOW_KICK_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const leadLowKickPipeline: ModulePosePipeline = {
  createRepDetector: () => createLeadLowKickRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackLeadLowKick,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyLeadLowKick,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

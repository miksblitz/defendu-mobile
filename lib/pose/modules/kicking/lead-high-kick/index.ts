/**
 * Lead high kick — left leg; knee and foot above hip, upward “\\” diagonal.
 */

import type { ModulePosePipeline } from '../../types';
import { createLeadHighKickRepDetector } from './leadHighKickRepDetector';
import {
  compareRepWithFeedbackAnyLeadHighKick,
  compareRepWithFeedbackLeadHighKick,
} from './leadHighKickComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const LEAD_HIGH_KICK_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775199821568';
export const LEAD_HIGH_KICK_REGISTRY_KEY = `kicking/${LEAD_HIGH_KICK_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const leadHighKickPipeline: ModulePosePipeline = {
  createRepDetector: () => createLeadHighKickRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackLeadHighKick,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyLeadHighKick,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

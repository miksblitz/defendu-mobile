/**
 * Lead Jab Test (Defendu): rep detector (left extended sideways, right contracted wrist-up).
 * Used by the "Lead Jab Test" built-in module and any uploaded module with the same logic.
 */

import type { ModulePosePipeline } from '../../types';
import { compareRepWithFeedback, compareRepWithFeedbackAny, DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import { createLeadJabRepDetector } from '../jab';
import type { PoseFocus } from '../../../types';

const poseFocus: PoseFocus = 'punching';

export const leadJabTestDefenduPipeline: ModulePosePipeline = {
  createRepDetector: () => createLeadJabRepDetector(),
  compareRepWithFeedback,
  compareRepWithFeedbackAny,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

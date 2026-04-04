/**
 * Side kick — left leg: charge (high knee) then extend to the side.
 */

import type { ModulePosePipeline } from '../../types';
import { createSideKickRepDetector } from './sideKickRepDetector';
import {
  compareRepWithFeedbackAnySideKick,
  compareRepWithFeedbackSideKick,
} from './sideKickComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const SIDE_KICK_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775199974918';
export const SIDE_KICK_REGISTRY_KEY = `kicking/${SIDE_KICK_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const sideKickPipeline: ModulePosePipeline = {
  createRepDetector: () => createSideKickRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackSideKick,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnySideKick,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

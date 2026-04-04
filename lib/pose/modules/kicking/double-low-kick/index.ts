/**
 * Double low kick — lead module then rear module (mirrored: MP right chain then left chain).
 */

import type { ModulePosePipeline } from '../../types';
import { createDoubleLowKickRepDetector } from './doubleLowKickRepDetector';
import {
  compareRepWithFeedbackAnyDoubleLowKick,
  compareRepWithFeedbackDoubleLowKick,
} from './doubleLowKickComparator';
import { DEFAULT_MATCH_THRESHOLD } from '../../../comparator';
import type { PoseFocus } from '../../../types';

export const DOUBLE_LOW_KICK_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1775300888122';
export const DOUBLE_LOW_KICK_REGISTRY_KEY = `kicking/${DOUBLE_LOW_KICK_MODULE_ID}`;

const poseFocus: PoseFocus = 'kicking';

export const doubleLowKickPipeline: ModulePosePipeline = {
  createRepDetector: () => createDoubleLowKickRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackDoubleLowKick,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyDoubleLowKick,
  defaultMatchThreshold: DEFAULT_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 6,
};

export { createDoubleLowKickRepDetector } from './doubleLowKickRepDetector';

/**
 * Lead elbow strike pipeline.
 * Pose tracking: **right** shoulder–elbow–wrist (MediaPipe 12/14/16 or MoveNet 6/8/10).
 * Final-pose only: count a rep once final elbow-strike position is reached.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createLeadElbowStrikeRepDetector } from './leadElbowStrikeRepDetector';
import {
  compareRepWithFeedbackLeadElbowStrike,
  compareRepWithFeedbackAnyLeadElbowStrike,
} from './leadElbowStrikeComparator';

export const LEAD_ELBOW_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774764292845';
export const LEAD_ELBOW_STRIKE_REGISTRY_KEY = `elbow_strikes/${LEAD_ELBOW_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'punching';

export const leadElbowStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createLeadElbowStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackLeadElbowStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyLeadElbowStrike,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 1,
};


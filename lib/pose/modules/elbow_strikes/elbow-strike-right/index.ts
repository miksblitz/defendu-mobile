/**
 * Elbow Strike (Right) — Firebase content module.
 * Pose tracking: **left** shoulder–elbow–wrist (MediaPipe 11/13/15 or MoveNet 5/7/9).
 * Final-pose only: count a rep once final elbow-strike position is reached.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createRightElbowStrikeRepDetector } from './rightElbowStrikeRepDetector';
import {
  compareRepWithFeedbackRightElbowStrike,
  compareRepWithFeedbackAnyRightElbowStrike,
} from './rightElbowStrikeComparator';

export const RIGHT_ELBOW_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774767037139';
export const RIGHT_ELBOW_STRIKE_REGISTRY_KEY = `elbow_strikes/${RIGHT_ELBOW_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'punching';

export const rightElbowStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createRightElbowStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackRightElbowStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyRightElbowStrike,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 1,
};

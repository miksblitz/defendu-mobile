/**
 * Backwards elbow strike pipeline (Firebase content).
 * Pose tracking: **left** shoulder–elbow–wrist (MediaPipe 11/13/15 or MoveNet 5/7/9).
 * Final pose: elbow dropped below shoulder, near-straight arm, forearm angled up—matches
 * reference CSV `BackwardsElbowStrike_MiksAboyme_pose_data.csv` (good_rep frames).
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createBackwardsElbowStrikeRepDetector } from './backwardsElbowStrikeRepDetector';
import {
  compareRepWithFeedbackBackwardsElbowStrike,
  compareRepWithFeedbackAnyBackwardsElbowStrike,
} from './backwardsElbowStrikeComparator';

export const BACKWARDS_ELBOW_STRIKE_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774765697890';
export const BACKWARDS_ELBOW_STRIKE_REGISTRY_KEY = `elbow_strikes/${BACKWARDS_ELBOW_STRIKE_MODULE_ID}`;

const poseFocus: PoseFocus = 'punching';

export const backwardsElbowStrikePipeline: ModulePosePipeline = {
  createRepDetector: () => createBackwardsElbowStrikeRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackBackwardsElbowStrike,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyBackwardsElbowStrike,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 1,
};

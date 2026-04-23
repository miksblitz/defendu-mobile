/**
 * Orthodox jab pipeline: fixed stance (torso faces camera, left side forward).
 * - Only LEFT hand extends for the jab.
 * - RIGHT hand stays in guard (contracted, wrist up).
 * - Rep only when motion: retract then extend (standing does not count).
 * Stricter form check and rep detection to avoid false positives.
 */

import type { ModulePosePipeline } from '../../types';
import {
  compareRepWithFeedbackOrthodox,
  compareRepWithFeedbackAnyOrthodox,
  PUNCHING_MATCH_THRESHOLD,
} from '../../../comparator';
import { createOrthodoxJabRepDetectorWithBadRep } from './orthodoxJabRepDetector';
import type { PoseFocus } from '../../../types';

const poseFocus: PoseFocus = 'punching';

export const orthodoxJabPipeline: ModulePosePipeline = {
  createRepDetector: () => createOrthodoxJabRepDetectorWithBadRep(),
  compareRepWithFeedback: compareRepWithFeedbackOrthodox,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyOrthodox,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 5,
};

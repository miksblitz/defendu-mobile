/**
 * Rear uppercut pipeline: user's RIGHT hand throws the uppercut, user's LEFT hand in guard.
 * Punch = MediaPipe LEFT arm; guard = MediaPipe RIGHT arm.
 */

import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createRearUppercutRepDetector } from './rearUppercutRepDetector';
import {
  compareRepWithFeedbackRearUppercut,
  compareRepWithFeedbackAnyRearUppercut,
} from './rearUppercutComparator';

const poseFocus: PoseFocus = 'punching';

export const rearUppercutPipeline: ModulePosePipeline = {
  createRepDetector: () => createRearUppercutRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackRearUppercut,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyRearUppercut,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 2,
};

export {
  compareRepWithFeedbackRearUppercut,
  compareRepWithFeedbackAnyRearUppercut,
} from './rearUppercutComparator';

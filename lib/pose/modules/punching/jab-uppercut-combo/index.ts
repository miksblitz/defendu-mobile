import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createJabUppercutComboRepDetector } from './jabUppercutComboRepDetector';
import {
  compareRepWithFeedbackJabUppercutCombo,
  compareRepWithFeedbackAnyJabUppercutCombo,
} from './jabUppercutComboComparator';

const poseFocus: PoseFocus = 'punching';

export const jabUppercutComboPipeline: ModulePosePipeline = {
  createRepDetector: () => createJabUppercutComboRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackJabUppercutCombo,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyJabUppercutCombo,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 3,
};

export { createJabUppercutComboRepDetector } from './jabUppercutComboRepDetector';

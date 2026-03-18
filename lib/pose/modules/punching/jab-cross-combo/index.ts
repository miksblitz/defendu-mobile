import type { ModulePosePipeline } from '../../types';
import type { PoseFocus } from '../../../types';
import { PUNCHING_MATCH_THRESHOLD } from '../../../comparator';
import { createJabCrossComboRepDetector } from './jabCrossComboRepDetector';
import {
  compareRepWithFeedbackJabCrossCombo,
  compareRepWithFeedbackAnyJabCrossCombo,
} from './jabCrossComboComparator';

const poseFocus: PoseFocus = 'punching';

export const jabCrossComboPipeline: ModulePosePipeline = {
  createRepDetector: () => createJabCrossComboRepDetector(),
  compareRepWithFeedback: compareRepWithFeedbackJabCrossCombo,
  compareRepWithFeedbackAny: compareRepWithFeedbackAnyJabCrossCombo,
  defaultMatchThreshold: PUNCHING_MATCH_THRESHOLD,
  poseFocus,
  minFramesForRep: 5,
};

export { createJabCrossComboRepDetector } from './jabCrossComboRepDetector';


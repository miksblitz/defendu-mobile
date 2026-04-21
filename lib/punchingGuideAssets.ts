import type { ImageSourcePropType } from 'react-native';

const LEAD_JAB = require('../assets/images/punching_guides/lead jab gif.gif');
const CROSS = require('../assets/images/punching_guides/cross gif.gif');
const JAB_CROSS = require('../assets/images/punching_guides/jab + cross gif.gif');
const LEAD_UPPERCUT = require('../assets/images/punching_guides/Lead uppercut gif.gif');
const REAR_UPPERCUT = require('../assets/images/punching_guides/rear uppercut.gif');
const JAB_REAR_UPPERCUT = require('../assets/images/punching_guides/lead jab + rear uppercut gif.gif');

/** Module IDs registered in `lib/pose/modules/registry.ts` (and matching Firebase keys). */
const MODULE_ID_TO_GUIDE: Record<string, ImageSourcePropType> = {
  module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773459399866: LEAD_JAB,
  module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773558054093: CROSS,
  module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773840563670: JAB_CROSS,
  module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773669360613: LEAD_UPPERCUT,
  module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773673272052: REAR_UPPERCUT,
  module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773844294396: JAB_REAR_UPPERCUT,
};

function isPunchingCategory(category: string | null | undefined): boolean {
  const s = (category ?? '').trim().toLowerCase();
  return s === 'punching' || s === 'jab' || s.includes('punch');
}

function titleSuggestsJabCrossCombo(t: string): boolean {
  if (t.includes('1-2') || t.includes('1–2') || t.includes('1 — 2')) return true;
  if (t.includes('jab') && t.includes('cross')) return true;
  if (t.includes('jab') && t.includes('straight')) return true;
  if (t.includes('straight') && t.includes('combo')) return true;
  if (t.includes('cross') && t.includes('combo')) return true;
  if (t.includes('basic') && (t.includes('1-2') || t.includes('1–2') || t.includes('combo'))) return true;
  return false;
}

/**
 * Bundled top-center GIF for pose training. Uses moduleId first, then title heuristics,
 * then defaults for Punching / Jab category so Firebase keys can differ from dev IDs.
 */
export function getPunchingGuideSource(
  moduleId: string | null | undefined,
  moduleTitle: string | null | undefined,
  category: string | null | undefined
): ImageSourcePropType | null {
  if (moduleId && MODULE_ID_TO_GUIDE[moduleId]) {
    return MODULE_ID_TO_GUIDE[moduleId];
  }

  const t = (moduleTitle ?? '').toLowerCase();
  const punching = isPunchingCategory(category);

  if (t.includes('jab uppercut')) {
    return JAB_REAR_UPPERCUT;
  }
  if (titleSuggestsJabCrossCombo(t)) {
    return JAB_CROSS;
  }
  if (t.includes('lead') && t.includes('uppercut')) {
    return LEAD_UPPERCUT;
  }
  if (t.includes('rear') && t.includes('uppercut')) {
    return REAR_UPPERCUT;
  }
  if (t.includes('cross')) {
    return CROSS;
  }
  if (t.includes('hook')) {
    return LEAD_JAB;
  }
  if (t.includes('jab')) {
    return LEAD_JAB;
  }
  if (punching) {
    return LEAD_JAB;
  }
  return null;
}

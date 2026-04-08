/**
 * Resolve the pose pipeline for a module by moduleId and category.
 * Each module can have its own folder under lib/pose/modules/<category>/<moduleId>/
 * with comparator, repDetector, normalizer, phaseDetection, poseFocus code.
 * If no module-specific folder exists, the category default is used (e.g. punching/default).
 */

import type { ModulePosePipeline } from './types';
import { punchingDefaultPipeline } from './punching/default';
import { orthodoxJabPipeline } from './punching/orthodox-jab';
import { crossJabPipeline } from './punching/cross';
import { leadHookPipeline } from './punching/lead-hook';
import { leadUppercutPipeline } from './punching/lead-uppercut';
import { rearUppercutPipeline } from './punching/rear-uppercut';
import { jabCrossComboPipeline } from './punching/jab-cross-combo';
import { jabUppercutComboPipeline } from './punching/jab-uppercut-combo';
import { kickingDefaultPipeline } from './kicking/default';
import { leadLowKickPipeline, LEAD_LOW_KICK_REGISTRY_KEY } from './kicking/lead-low-kick';
import { rearLowKickPipeline, REAR_LOW_KICK_REGISTRY_KEY } from './kicking/rear-low-kick';
import { leadHighKickPipeline, LEAD_HIGH_KICK_REGISTRY_KEY } from './kicking/lead-high-kick';
import { sideKickPipeline, SIDE_KICK_REGISTRY_KEY } from './kicking/side-kick';
import { doubleLowKickPipeline, DOUBLE_LOW_KICK_REGISTRY_KEY } from './kicking/double-low-kick';
import { elbowStrikesDefaultPipeline } from './elbow_strikes/default';
import { leadUppercutElbowStrikePipeline } from './elbow_strikes/lead-uppercut-elbow-strike';
import { rearUppercutElbowStrikePipeline } from './elbow_strikes/rear-uppercut-elbow-strike';
import {
  leadElbowStrikePipeline,
  LEAD_ELBOW_STRIKE_REGISTRY_KEY,
} from './elbow_strikes/lead-elbow-strike';
import {
  rightElbowStrikePipeline,
  RIGHT_ELBOW_STRIKE_REGISTRY_KEY,
} from './elbow_strikes/elbow-strike-right';
import {
  backwardsElbowStrikePipeline,
  BACKWARDS_ELBOW_STRIKE_REGISTRY_KEY,
} from './elbow_strikes/backwards-elbow-strike';
import { kneeStrikesDefaultPipeline } from './knee_strikes/default';
import {
  lowLeadKneeStrikePipeline,
  LOW_LEAD_KNEE_STRIKE_REGISTRY_KEY,
} from './knee_strikes/low-lead-knee-strike';
import {
  lowRearKneeStrikePipeline,
  LOW_REAR_KNEE_STRIKE_REGISTRY_KEY,
} from './knee_strikes/low-rear-knee-strike';
import {
  highLeadKneeStrikePipeline,
  HIGH_LEAD_KNEE_STRIKE_REGISTRY_KEY,
} from './knee_strikes/high-lead-knee-strike';
import {
  highRearKneeStrikePipeline,
  HIGH_REAR_KNEE_STRIKE_REGISTRY_KEY,
} from './knee_strikes/high-rear-knee-strike';
import {
  doubleHighKneeStrikePipeline,
  DOUBLE_HIGH_KNEE_STRIKE_REGISTRY_KEY,
} from './knee_strikes/double-high-knee-strike';
import {
  doubleLowKneeStrikePipeline,
  DOUBLE_LOW_KNEE_STRIKE_REGISTRY_KEY,
} from './knee_strikes/double-low-knee-strike';
import { defensiveMovesDefaultPipeline } from './defensive_moves/default';
import { defensiveBlockPipeline, BLOCK_MODULE_REGISTRY_KEY } from './defensive_moves/block';
import { defensiveSlipPipeline, SLIP_MODULE_REGISTRY_KEY } from './defensive_moves/slip';
import { defensiveParryPipeline, PARRY_MODULE_REGISTRY_KEY } from './defensive_moves/parry';
import { defensiveDuckingPipeline, DUCKING_MODULE_REGISTRY_KEY } from './defensive_moves/ducking';
import { defensiveRollPipeline, ROLL_MODULE_REGISTRY_KEY } from './defensive_moves/roll';

/** App category display names -> folder key */
const CATEGORY_TO_KEY: Record<string, string> = {
  Punching: 'punching',
  Kicking: 'kicking',
  'Elbow Strikes': 'elbow_strikes',
  'Knee Strikes': 'knee_strikes',
  'Defensive Moves': 'defensive_moves',
  punching: 'punching',
  kicking: 'kicking',
  elbow_strikes: 'elbow_strikes',
  knee_strikes: 'knee_strikes',
  defensive_moves: 'defensive_moves',
};

/** (categoryKey, moduleId) -> pipeline. Module-specific overrides first, then category default. */
const PIPELINES: Map<string, ModulePosePipeline> = new Map();

function register(key: string, pipeline: ModulePosePipeline): void {
  PIPELINES.set(key, pipeline);
}

// Category defaults: <categoryKey>/default
register('punching/default', punchingDefaultPipeline);
register('kicking/default', kickingDefaultPipeline);
register(LEAD_LOW_KICK_REGISTRY_KEY, leadLowKickPipeline);
register(REAR_LOW_KICK_REGISTRY_KEY, rearLowKickPipeline);
register(LEAD_HIGH_KICK_REGISTRY_KEY, leadHighKickPipeline);
register(SIDE_KICK_REGISTRY_KEY, sideKickPipeline);
register(DOUBLE_LOW_KICK_REGISTRY_KEY, doubleLowKickPipeline);
register('elbow_strikes/default', elbowStrikesDefaultPipeline);
// Lead elbow strike module:
// guard_stance -> transition -> elbowstrikefinalposition -> guard_stance
register('elbow_strikes/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774767480246', leadUppercutElbowStrikePipeline);
// Rear elbow strike module
register('elbow_strikes/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774763194879', rearUppercutElbowStrikePipeline);
// Lead elbow strike module (final position only; right landmark chain 12/14/16).
register(LEAD_ELBOW_STRIKE_REGISTRY_KEY, leadElbowStrikePipeline);
// Elbow Strike (Right) Firebase module — left landmark chain 11/13/15 (swapped vs lead for mirror/setup).
register(RIGHT_ELBOW_STRIKE_REGISTRY_KEY, rightElbowStrikePipeline);
// Backwards elbow strike — left chain 11/13/15; final pose from reference good_rep analysis.
register(BACKWARDS_ELBOW_STRIKE_REGISTRY_KEY, backwardsElbowStrikePipeline);
register('knee_strikes/default', kneeStrikesDefaultPipeline);
register(LOW_LEAD_KNEE_STRIKE_REGISTRY_KEY, lowLeadKneeStrikePipeline);
register(LOW_REAR_KNEE_STRIKE_REGISTRY_KEY, lowRearKneeStrikePipeline);
register(HIGH_LEAD_KNEE_STRIKE_REGISTRY_KEY, highLeadKneeStrikePipeline);
register(HIGH_REAR_KNEE_STRIKE_REGISTRY_KEY, highRearKneeStrikePipeline);
register(DOUBLE_HIGH_KNEE_STRIKE_REGISTRY_KEY, doubleHighKneeStrikePipeline);
register(DOUBLE_LOW_KNEE_STRIKE_REGISTRY_KEY, doubleLowKneeStrikePipeline);
register('defensive_moves/default', defensiveMovesDefaultPipeline);
// Block module (Firebase): stance to guard/blocking defensive movement.
register(BLOCK_MODULE_REGISTRY_KEY, defensiveBlockPipeline);
// Slip module (Firebase): upper-body centerline evasion with stable hips/core.
register(SLIP_MODULE_REGISTRY_KEY, defensiveSlipPipeline);
// Parry module (Firebase): left or right arm parry, with cooldown between reps.
register(PARRY_MODULE_REGISTRY_KEY, defensiveParryPipeline);
// Ducking module (Firebase): standing up/down detection with guard-up requirement.
register(DUCKING_MODULE_REGISTRY_KEY, defensiveDuckingPipeline);
// Slip + opposite-hand parry (Firebase id …72612042; folder name "roll" is legacy).
register(ROLL_MODULE_REGISTRY_KEY, defensiveRollPipeline);
// Cross Jab Test (Firebase module) – right punch, left guard.
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773558054093', crossJabPipeline);
// Lead Hook Test (Firebase module) – left hook, right guard.
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773562287677', leadHookPipeline);
// Lead Uppercut Test (Firebase module) – left uppercut, right guard.
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773669360613', leadUppercutPipeline);
// Rear Uppercut Test (Firebase module) – right uppercut, left guard.
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773673272052', rearUppercutPipeline);
// Jab → Cross combo (Firebase module) – perfect rep only when jab first, then cross.
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773840563670', jabCrossComboPipeline);
// Jab → rear uppercut combo (trained reference: jab then uppercut).
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773844294396', jabUppercutComboPipeline);
// Legacy / other modules
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773459399866', orthodoxJabPipeline);

/**
 * Get the pose pipeline for a module. Use when opening "Try with pose" so the
 * comparator, rep detector, and thresholds are specific to that module.
 * Returns null if category is unknown; then the app falls back to global pose lib + poseVariant/poseFocus.
 */
export function getModulePosePipeline(moduleId: string, category: string): ModulePosePipeline | null {
  const categoryKey = CATEGORY_TO_KEY[category] ?? category.toLowerCase().replace(/\s+/g, '_');
  const moduleKey = `${categoryKey}/${moduleId}`;
  const defaultKey = `${categoryKey}/default`;
  return PIPELINES.get(moduleKey) ?? PIPELINES.get(defaultKey) ?? null;
}

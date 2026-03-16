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
import { kickingDefaultPipeline } from './kicking/default';
import { elbowStrikesDefaultPipeline } from './elbow_strikes/default';
import { kneeStrikesDefaultPipeline } from './knee_strikes/default';
import { defensiveMovesDefaultPipeline } from './defensive_moves/default';

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
register('elbow_strikes/default', elbowStrikesDefaultPipeline);
register('knee_strikes/default', kneeStrikesDefaultPipeline);
register('defensive_moves/default', defensiveMovesDefaultPipeline);

// Cross Jab Test (Firebase module) – right punch, left guard.
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773558054093', crossJabPipeline);
// Lead Hook Test (Firebase module) – left hook, right guard.
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773562287677', leadHookPipeline);
// Lead Uppercut Test (Firebase module) – left uppercut, right guard.
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773669360613', leadUppercutPipeline);
// Rear Uppercut Test (Firebase module) – right uppercut, left guard.
register('punching/module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1773673272052', rearUppercutPipeline);
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

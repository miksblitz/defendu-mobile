/**
 * Personalized top-module picks: skill-profile fit (ported from DEFENDU/ml-recommendation
 * `profile_module_fit.py`), collaborative signal from `recommendations/{uid}`, and
 * optional training failure stats once the user has enough completions.
 */
import type { ModuleItem } from '../controllers/modulesCatalog';
import type { SkillProfile } from '../models/SkillProfile';

const EXPERIENCE_LEVELS = ['Complete Beginner', 'Some Experience', 'Experienced', 'Expert/Instructor'] as const;
const CURRENT_FITNESS_LEVELS = ['Low', 'Moderate', 'High', 'Athlete'] as const;
const HIGH_DEMAND_TAGS = new Set(['Power', 'Speed', 'Agility', 'Endurance', 'Strength']);
const ARM_CATEGORIES = new Set(['punching', 'palm strikes', 'elbow strikes']);
const LEG_CATEGORIES = new Set(['kicking', 'knee strikes']);

/** After this many completed modules, failure/struggle weighs more in ranking. */
export const PERFORMANCE_PHASE_COMPLETION_THRESHOLD = 5;

function levelTo15(level: string, levels: readonly string[]): number {
  if (!level || !levels.includes(level)) return 3;
  const idx = levels.indexOf(level);
  const n = levels.length;
  if (n <= 1) return 3;
  return 1 + (idx / (n - 1)) * 4;
}

function effectiveIntensity(mod: ModuleItem): number {
  if (typeof mod.intensityLevel === 'number' && mod.intensityLevel >= 1 && mod.intensityLevel <= 5) {
    return mod.intensityLevel;
  }
  const d = mod.difficultyLevel;
  if (d === 'basic') return 2;
  if (d === 'intermediate') return 3;
  if (d === 'advanced') return 4;
  return 3;
}

/**
 * Mirrors `ml-recommendation/features/profile_module_fit.py` (outputs in [0, 1]).
 */
export function profileModuleFit(profile: SkillProfile, mod: ModuleItem): number {
  const intensity = effectiveIntensity(mod);
  const physicalDemandTags = new Set((mod.physicalDemandTags ?? []).map((t) => String(t).trim()));
  const category = (mod.category ?? '').trim().toLowerCase();

  const expNum = levelTo15(profile.pastExperience.experienceLevel, EXPERIENCE_LEVELS);
  const fitNum = levelTo15(profile.fitnessCapabilities.currentFitnessLevel, CURRENT_FITNESS_LEVELS);
  const preferred = Math.max(expNum, fitNum);
  const diff = Math.abs(intensity - preferred);
  let intensityScore: number;
  if (intensity > preferred + 1) intensityScore = 0.3;
  else intensityScore = Math.max(0.2, 1.0 - 0.2 * diff);

  let techniqueScore = 0.5;
  for (const t of profile.preferences.preferredTechnique ?? []) {
    if (t && t.toLowerCase().includes(category)) {
      techniqueScore = 1.0;
      break;
    }
    if (t && category.includes(t.toLowerCase())) {
      techniqueScore = 1.0;
      break;
    }
  }
  let goalsScore = 0.5;
  for (const g of profile.preferences.trainingGoal ?? []) {
    if (g && category.includes(g.toLowerCase())) {
      goalsScore = 1.0;
      break;
    }
  }
  const wantsScore = (techniqueScore + goalsScore) / 2;

  const limitationsText = `${profile.physicalAttributes.limitations ?? ''} ${profile.fitnessCapabilities.injuries ?? ''}`.toLowerCase();
  const hasLimitations = Boolean(
    (profile.physicalAttributes.limitations ?? '').trim() || (profile.fitnessCapabilities.injuries ?? '').trim()
  );

  let capabilityPenalty = 1.0;
  if (hasLimitations && [...physicalDemandTags].some((t) => HIGH_DEMAND_TAGS.has(t))) {
    capabilityPenalty = 0.7;
  }

  let noArms = ['no arm', 'no use of arm', 'without arm', 'limited arm', 'arms limited', 'no arms'].some((p) =>
    limitationsText.includes(p)
  );
  let noLegs = ['no leg', 'no use of leg', 'without leg', 'limited leg', 'legs limited', 'no legs', 'wheelchair', 'no use of legs'].some(
    (p) => limitationsText.includes(p)
  );
  if (limitationsText.includes('upper body only') || limitationsText.includes('wheelchair')) {
    noLegs = true;
    noArms = false;
  }
  if (limitationsText.includes('no use of arms') || limitationsText.includes('no arms')) noArms = true;
  if (limitationsText.includes('no use of legs') || limitationsText.includes('no legs')) noLegs = true;

  if (noArms && ARM_CATEGORIES.has(category)) capabilityPenalty = Math.min(capabilityPenalty, 0.4);
  if (noLegs && LEG_CATEGORIES.has(category)) capabilityPenalty = Math.min(capabilityPenalty, 0.4);

  const combined = 0.6 * intensityScore + 0.4 * wantsScore;
  return Math.max(0, Math.min(1, combined * capabilityPenalty));
}

function mlBoost(moduleId: string, mlOrderedIds: string[]): number {
  const idx = mlOrderedIds.indexOf(moduleId);
  if (idx < 0) return 0.22;
  const n = mlOrderedIds.length || 1;
  return 0.55 + (0.45 * (n - 1 - idx)) / Math.max(1, n - 1);
}

function struggleBoost(failCount: number, completedCount: number): number {
  const n = Math.max(0, failCount);
  if (n === 0) return 0.12;
  const capped = Math.min(n / 4, 1);
  if (completedCount < PERFORMANCE_PHASE_COMPLETION_THRESHOLD) {
    return 0.12 + capped * 0.28;
  }
  return 0.18 + capped * 0.82;
}

export interface PersonalizedRecommendationInput {
  modules: ModuleItem[];
  skillProfile: SkillProfile | null;
  completedModuleIds: string[];
  /** failCount from Firebase `userProgress.moduleTrainingStats`. */
  moduleTrainingStats: Record<string, { failCount: number }>;
  /** Order matters: first = strongest from batch ML export / similar users. */
  mlRecommendedModuleIds: string[];
  topN?: number;
}

export function buildPersonalizedModuleRecommendations(input: PersonalizedRecommendationInput): string[] {
  const {
    modules,
    skillProfile,
    completedModuleIds,
    moduleTrainingStats,
    mlRecommendedModuleIds,
    topN = 5,
  } = input;

  const completed = new Set(completedModuleIds);
  const completedCount = completedModuleIds.length;
  const inPerformancePhase = completedCount >= PERFORMANCE_PHASE_COMPLETION_THRESHOLD;

  const candidates = modules.filter((m) => m.moduleId && !completed.has(m.moduleId));
  if (candidates.length === 0) return [];

  const weights = inPerformancePhase
    ? { profile: 0.32, ml: 0.28, struggle: 0.4 }
    : { profile: 0.52, ml: 0.38, struggle: 0.1 };

  const scored = candidates.map((mod) => {
    const profileScore = skillProfile ? profileModuleFit(skillProfile, mod) : 0.48;
    const mlScore = mlBoost(mod.moduleId, mlRecommendedModuleIds);
    const fails = moduleTrainingStats[mod.moduleId]?.failCount ?? 0;
    const strScore = struggleBoost(fails, completedCount);
    const total = weights.profile * profileScore + weights.ml * mlScore + weights.struggle * strScore;
    return { moduleId: mod.moduleId, total, profileScore, mlScore, strScore };
  });

  scored.sort((a, b) => b.total - a.total || b.profileScore - a.profileScore);

  const out: string[] = [];
  for (const row of scored) {
    if (out.includes(row.moduleId)) continue;
    out.push(row.moduleId);
    if (out.length >= topN) break;
  }
  return out;
}

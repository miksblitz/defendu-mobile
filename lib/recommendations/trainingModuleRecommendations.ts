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
/** Strikes that require at least one arm; used when both arms are unavailable. */
const UPPER_BODY_STRIKE_CATEGORIES = new Set(['punching', 'palm strikes', 'elbow strikes']);
/**
 * Categories where we infer left/right emphasis for single-limb routing (arm + defensive).
 */
const ARM_SIDE_RELEVANT_CATEGORIES = new Set([...ARM_CATEGORIES, 'defensive moves']);

type Side = 'left' | 'right';

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

type MissingLimbFlags = {
  leftArmMissing: boolean;
  rightArmMissing: boolean;
  leftLegMissing: boolean;
  rightLegMissing: boolean;
};

function parseMissingLimbFlags(text: string): MissingLimbFlags {
  const t = text.toLowerCase();
  const has = (patterns: string[]): boolean => patterns.some((p) => t.includes(p));
  return {
    leftArmMissing: has(['no left arm', 'without left arm', 'missing left arm', 'cannot use left arm', "can't use left arm", 'left arm amput']),
    rightArmMissing: has(['no right arm', 'without right arm', 'missing right arm', 'cannot use right arm', "can't use right arm", 'right arm amput']),
    leftLegMissing: has(['no left leg', 'without left leg', 'missing left leg', 'cannot use left leg', "can't use left leg", 'left leg amput']),
    rightLegMissing: has(['no right leg', 'without right leg', 'missing right leg', 'cannot use right leg', "can't use right leg", 'right leg amput']),
  };
}

/** Which arm-side the module emphasizes (lead/jab vs rear/cross), from title + category. */
function armSideAffinitySet(mod: ModuleItem): Set<Side> {
  const cat = (mod.category ?? '').trim().toLowerCase();
  if (!ARM_SIDE_RELEVANT_CATEGORIES.has(cat)) return new Set();
  const tokens = `${mod.moduleTitle ?? ''} ${mod.category ?? ''}`.toLowerCase();
  const out = new Set<Side>();
  const leftHint =
    /\bjab\b/.test(tokens) ||
    /\blead\b/.test(tokens) ||
    /\bleft\s+(hook|uppercut|straight)\b/.test(tokens) ||
    /\bleft\s+elbow\b/.test(tokens) ||
    /lead\s+(hook|uppercut|elbow)\b/.test(tokens) ||
    (/\bleft\b/.test(tokens) && !/\bleft\s+leg\b/.test(tokens));
  const rightHint =
    /\bcross\b/.test(tokens) ||
    /\brear\b/.test(tokens) ||
    /\bstraight\s*right\b/.test(tokens) ||
    /\bright\s+(hook|uppercut|straight)\b/.test(tokens) ||
    /\bright\s+elbow\b/.test(tokens) ||
    /\bright\b/.test(tokens);
  if (leftHint) out.add('left');
  if (rightHint) out.add('right');
  return out;
}

/** Left vs right emphasis for kicks/knees from module title. */
function legSideAffinitySet(mod: ModuleItem): Set<Side> {
  const cat = (mod.category ?? '').trim().toLowerCase();
  if (!LEG_CATEGORIES.has(cat)) return new Set();
  const tokens = `${mod.moduleTitle ?? ''}`.toLowerCase();
  const out = new Set<Side>();
  if (/\bleft\b/.test(tokens) || /lead\s*leg\b/.test(tokens) || /\bleft\s+(kick|knee)\b/.test(tokens)) out.add('left');
  if (/\bright\b/.test(tokens) || /rear\s*leg\b/.test(tokens) || /\bright\s+(kick|knee)\b/.test(tokens)) out.add('right');
  return out;
}

function bothArmsUnavailable(flags: MissingLimbFlags, limitationsText: string, noArmsBroad: boolean): boolean {
  if (noArmsBroad) return true;
  if (flags.leftArmMissing && flags.rightArmMissing) return true;
  if (/\bboth arms\b/.test(limitationsText) || limitationsText.includes('limited mobility in both arms')) return true;
  return false;
}

function bothLegsUnavailable(flags: MissingLimbFlags, limitationsText: string, noLegsBroad: boolean): boolean {
  if (noLegsBroad) return true;
  if (flags.leftLegMissing && flags.rightLegMissing) return true;
  if (/\bboth legs\b/.test(limitationsText) || limitationsText.includes('limited mobility in both legs')) return true;
  return false;
}

function prefRequiresArmsForTechnique(p: string): boolean {
  const s = p.toLowerCase();
  return s.includes('punch') || s.includes('elbow') || s.includes('palm');
}

function prefRequiresLegsForTechnique(p: string): boolean {
  const s = p.toLowerCase();
  return s.includes('kick') || s.includes('knee');
}

/**
 * When preferred techniques are impossible (e.g. both arms gone but only punching selected),
 * raise score for viable alternative categories so recommendations shift off strikes.
 */
function applyLimbAwareTechniqueAdjustments(
  techniqueScore: number,
  profile: SkillProfile,
  category: string,
  missingLimbFlags: MissingLimbFlags,
  limitationsText: string,
  noArmsBroad: boolean,
  noLegsBroad: boolean
): number {
  let ts = techniqueScore;
  const prefs = profile.preferences.preferredTechnique ?? [];
  const bothArms = bothArmsUnavailable(missingLimbFlags, limitationsText, noArmsBroad);
  const bothLegs = bothLegsUnavailable(missingLimbFlags, limitationsText, noLegsBroad);

  const onlyArmStrikePrefs =
    prefs.length > 0 && prefs.every(prefRequiresArmsForTechnique);
  const onlyLegStrikePrefs = prefs.length > 0 && prefs.every(prefRequiresLegsForTechnique);

  if (bothArms) {
    if (UPPER_BODY_STRIKE_CATEGORIES.has(category)) {
      ts = Math.min(ts, 0.12);
    } else if (category === 'defensive moves') {
      ts = Math.min(ts, 0.38);
    }
    if (onlyArmStrikePrefs) {
      if (LEG_CATEGORIES.has(category) || category === 'defensive moves') {
        ts = Math.max(ts, 0.76);
      }
    }
  }

  if (bothLegs) {
    if (LEG_CATEGORIES.has(category)) {
      ts = Math.min(ts, 0.12);
    }
    if (onlyLegStrikePrefs) {
      if (ARM_SIDE_RELEVANT_CATEGORIES.has(category)) {
        ts = Math.max(ts, 0.76);
      }
    }
  }

  return ts;
}

/**
 * Prefer modules solvable with the remaining limb(s): boost functional side, downrank impaired side.
 * When both arms or both legs are gone, heavily downrank that limb family and lightly uplift alternatives.
 */
function limbFunctionalFitMultiplier(
  mod: ModuleItem,
  category: string,
  flags: MissingLimbFlags,
  limitationsText: string,
  noArmsBroad: boolean,
  noLegsBroad: boolean
): number {
  const bothArms = bothArmsUnavailable(flags, limitationsText, noArmsBroad);
  const bothLegs = bothLegsUnavailable(flags, limitationsText, noLegsBroad);

  if (bothArms) {
    if (UPPER_BODY_STRIKE_CATEGORIES.has(category)) return 0.18;
    if (category === 'defensive moves') return 0.42;
    if (LEG_CATEGORIES.has(category)) return 1.14;
    return 1.0;
  }

  if (bothLegs) {
    if (LEG_CATEGORIES.has(category)) return 0.18;
    if (ARM_SIDE_RELEVANT_CATEGORIES.has(category)) return 1.12;
    return 1.0;
  }

  const onlyLeftArmGone = flags.leftArmMissing && !flags.rightArmMissing;
  const onlyRightArmGone = flags.rightArmMissing && !flags.leftArmMissing;

  if (onlyLeftArmGone || onlyRightArmGone) {
    const armSides = armSideAffinitySet(mod);
    if (ARM_SIDE_RELEVANT_CATEGORIES.has(category)) {
      if (armSides.size === 0) return 1.0;
      if (armSides.has('left') && armSides.has('right')) return 0.96;
      // Missing left arm → use right (rear/cross); missing right → use left (lead/jab).
      if (onlyLeftArmGone) {
        if (armSides.has('right')) return 1.22;
        if (armSides.has('left')) return 0.78;
      }
      if (onlyRightArmGone) {
        if (armSides.has('left')) return 1.22;
        if (armSides.has('right')) return 0.78;
      }
    }
  }

  const onlyLeftLegGone = flags.leftLegMissing && !flags.rightLegMissing;
  const onlyRightLegGone = flags.rightLegMissing && !flags.leftLegMissing;

  if (onlyLeftLegGone || onlyRightLegGone) {
    const legSides = legSideAffinitySet(mod);
    if (LEG_CATEGORIES.has(category)) {
      if (legSides.size === 0) return 1.0;
      if (legSides.has('left') && legSides.has('right')) return 0.96;
      if (onlyLeftLegGone) {
        if (legSides.has('right')) return 1.22;
        if (legSides.has('left')) return 0.78;
      }
      if (onlyRightLegGone) {
        if (legSides.has('left')) return 1.22;
        if (legSides.has('right')) return 0.78;
      }
    }
  }

  return 1.0;
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

  const limitationsText = `${profile.physicalAttributes.limitations ?? ''} ${profile.fitnessCapabilities.injuries ?? ''}`.toLowerCase();
  const missingLimbFlags = parseMissingLimbFlags(limitationsText);
  const hasLimitations = Boolean(
    (profile.physicalAttributes.limitations ?? '').trim() || (profile.fitnessCapabilities.injuries ?? '').trim()
  );

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

  techniqueScore = applyLimbAwareTechniqueAdjustments(
    techniqueScore,
    profile,
    category,
    missingLimbFlags,
    limitationsText,
    noArms,
    noLegs
  );

  let goalsScore = 0.5;
  for (const g of profile.preferences.trainingGoal ?? []) {
    if (g && category.includes(g.toLowerCase())) {
      goalsScore = 1.0;
      break;
    }
  }
  const wantsScore = (techniqueScore + goalsScore) / 2;

  let capabilityPenalty = 1.0;
  if (hasLimitations && [...physicalDemandTags].some((t) => HIGH_DEMAND_TAGS.has(t))) {
    capabilityPenalty = 0.7;
  }

  if (noArms && ARM_CATEGORIES.has(category)) capabilityPenalty = Math.min(capabilityPenalty, 0.4);
  if (noLegs && LEG_CATEGORIES.has(category)) capabilityPenalty = Math.min(capabilityPenalty, 0.4);

  const combined = 0.6 * intensityScore + 0.4 * wantsScore;
  const limbFit = limbFunctionalFitMultiplier(mod, category, missingLimbFlags, limitationsText, noArms, noLegs);
  return Math.max(0, Math.min(1, combined * capabilityPenalty * limbFit));
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

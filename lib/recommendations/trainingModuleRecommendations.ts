/**
 * Personalized top-module picks: skill-profile fit (ported from DEFENDU/ml-recommendation
 * `profile_module_fit.py`), collaborative signal from `recommendations/{uid}`, and
 * optional training failure stats once the user has enough completions.
 *
 * ## Recommendation rules (priority order)
 *
 * ### 1. Physical limitations first
 * - **No usable arms** (broad “no arms”, both arms, or both-arm phrases): hard-exclude arm strikes
 *   (`isModuleAccessible`); rank kicks/knees ahead of upper-body strikes when legs can still strike.
 * - **Leg impairment**: exclude modules that depend on the affected leg; keep strikes on the good leg,
 *   knees on the good leg, and upper-body work when arms are available (`singleRemainingLegAllowsLegModule`,
 *   `limbFunctionalFitMultiplier`).
 *
 * ### 2. Preferences (after accessibility)
 * - **All five technique toggles** (matches onboarding) + **no limb limitations**: guarantee at least one
 *   top pick per category in order punching → kicking → elbow → knee → defense when the catalog has
 *   each (`pickBestPerModuleCategoryBucket`, stable display order).
 * - **Subset of techniques** + **no limb limitations**: only modules whose category matches a selected
 *   technique (`filterCandidatesByExplicitTechniquePreferences`).
 * - **Subset + limb limitations**: do not narrow the catalog by prefs alone — limitations may require
 *   alternatives outside the stated prefs; tier ordering + scoring handle leg/arm priorities.
 * - **Mixed prefs (not all five)**: primary score blend, then tie-break by preference match → profile
 *   fit (physical compatibility) → ML signal (`buildPersonalizedModuleRecommendations` sort).
 */
import type { ModuleItem } from '../controllers/modulesCatalog';
import type { SkillProfile } from '../models/SkillProfile';

const EXPERIENCE_LEVELS = ['Complete Beginner', 'Some Experience', 'Experienced', 'Expert/Instructor'] as const;
const CURRENT_FITNESS_LEVELS = ['Low', 'Moderate', 'High', 'Athlete'] as const;
const HIGH_DEMAND_TAGS = new Set(['Power', 'Speed', 'Agility', 'Endurance', 'Strength']);
const ARM_CATEGORIES = new Set(['punching', 'elbow strikes']);
const LEG_CATEGORIES = new Set(['kicking', 'knee strikes']);
/** Strikes that require at least one arm; used when both arms are unavailable. */
const UPPER_BODY_STRIKE_CATEGORIES = new Set(['punching', 'elbow strikes']);
/**
 * Categories where we infer left/right emphasis for single-limb routing (arm + defensive).
 */
const ARM_SIDE_RELEVANT_CATEGORIES = new Set([...ARM_CATEGORIES, 'defensive moves']);

/**
 * Must stay aligned with `SkillProfilePreferencesScreen` `PREFERRED_TECHNIQUES` keys.
 * Used for “selected all techniques” and per-category diversity seeding.
 */
export const CANONICAL_TECHNIQUE_PREF_LABELS = [
  'Punching',
  'Kicking',
  'Elbow Strikes',
  'Knee Strikes',
  'Defensive Moves',
] as const;

/**
 * One recommended module per bucket when user selected all techniques and has no limb limits.
 * Order matches UX: punching, kicking, elbows, knees, then defense.
 */
export const ALL_FIVE_RECOMMENDATION_CATEGORY_ORDER = [
  'punching',
  'kicking',
  'elbow strikes',
  'knee strikes',
  'defensive moves',
] as const;

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

/**
 * True when `category` matches any entry in preferred techniques (same rules as profile technique scoring).
 * Empty prefs → true so we do not filter exploration.
 */
export function categoryMatchesPreferredTechnique(profile: SkillProfile, category: string): boolean {
  const cat = category.trim().toLowerCase();
  const prefs = profile.preferences.preferredTechnique ?? [];
  if (prefs.length === 0) return true;
  for (const t of prefs) {
    if (!t) continue;
    const tl = t.toLowerCase();
    if (tl.includes(cat)) return true;
    if (cat.includes(tl)) return true;
  }
  return false;
}

/** Preferred technique labels that emphasize upper body (punching, elbows, head movement). */
function prefersUpperBodyTechniques(profile: SkillProfile): boolean {
  for (const t of profile.preferences.preferredTechnique ?? []) {
    if (!t) continue;
    const s = t.toLowerCase();
    if (s.includes('punch') || s.includes('elbow') || s.includes('defensive')) return true;
  }
  return false;
}

/** Preferred technique labels that emphasize kicks / knees. */
function prefersLegTechniques(profile: SkillProfile): boolean {
  for (const t of profile.preferences.preferredTechnique ?? []) {
    if (!t) continue;
    const s = t.toLowerCase();
    if (s.includes('kick') || s.includes('knee')) return true;
  }
  return false;
}

/** Lift from limb-aware prefs tuning — above this, category is a deliberate alternative for impaired users. */
const ALTERNATIVE_TECHNIQUE_BOOST_THRESHOLD = 0.62;

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
    leftArmMissing: has([
      'no left arm',
      'without left arm',
      'missing left arm',
      'cannot use left arm',
      "can't use left arm",
      'no use of left arm',
      'left arm amput',
    ]),
    rightArmMissing: has([
      'no right arm',
      'without right arm',
      'missing right arm',
      'cannot use right arm',
      "can't use right arm",
      'no use of right arm',
      'right arm amput',
    ]),
    leftLegMissing: has([
      'no left leg',
      'without left leg',
      'missing left leg',
      'cannot use left leg',
      "can't use left leg",
      'no use of left leg',
      'cannot use my left leg',
      'left leg amput',
    ]),
    rightLegMissing: has([
      'no right leg',
      'without right leg',
      'missing right leg',
      'cannot use right leg',
      "can't use right leg",
      'no use of right leg',
      'cannot use my right leg',
      'right leg amput',
    ]),
  };
}

/** Which arm-side the module emphasizes (lead/jab vs rear/cross), from title + category + description. */
function armSideAffinitySet(mod: ModuleItem): Set<Side> {
  const cat = (mod.category ?? '').trim().toLowerCase();
  if (!ARM_SIDE_RELEVANT_CATEGORIES.has(cat)) return new Set();
  const tokens = `${mod.moduleTitle ?? ''} ${mod.category ?? ''} ${mod.description ?? ''}`.toLowerCase();
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

/**
 * Left vs right emphasis for kicks/knees from module id + title + description.
 * Underscores in moduleId are normalized to spaces so `rear_low_kick` matches rear/lead tokens.
 */
function legSideAffinitySet(mod: ModuleItem): Set<Side> {
  const cat = (mod.category ?? '').trim().toLowerCase();
  if (!LEG_CATEGORIES.has(cat)) return new Set();
  const raw = `${mod.moduleId ?? ''} ${mod.moduleTitle ?? ''} ${mod.description ?? ''}`.toLowerCase();
  const tokens = raw.replace(/_/g, ' ');
  const out = new Set<Side>();
  if (
    /\bleft\b/.test(tokens) ||
    /\blead\b/.test(tokens) ||
    /lead\s*leg\b/.test(tokens) ||
    /\bleft\s+(kick|knee)\b/.test(tokens)
  ) {
    out.add('left');
  }
  if (
    /\bright\b/.test(tokens) ||
    /\brear\b/.test(tokens) ||
    /rear\s*leg\b/.test(tokens) ||
    /\bright\s+(kick|knee)\b/.test(tokens)
  ) {
    out.add('right');
  }
  return out;
}

/** When exactly one leg is gone: which side is still used for stance strikes (orthodox mental model). */
function usableKickingLegSide(flags: MissingLimbFlags, bothLegsBroad: boolean): 'left' | 'right' | null {
  if (bothLegsBroad) return null;
  if (flags.leftLegMissing && !flags.rightLegMissing) return 'right';
  if (flags.rightLegMissing && !flags.leftLegMissing) return 'left';
  return null;
}

/**
 * Hard gate for kicking/knee when one leg is unusable: only allow modules that clearly use the
 * remaining leg (lead/left vs rear/right). Ambiguous or bilateral leg drills are excluded.
 */
function singleRemainingLegAllowsLegModule(mod: ModuleItem, workingSide: 'left' | 'right'): boolean {
  const raw = `${mod.moduleId ?? ''} ${mod.moduleTitle ?? ''} ${mod.description ?? ''}`.toLowerCase();
  const tokens = raw.replace(/_/g, ' ');
  if (
    /\b(both legs|alternating legs|alternating kick|switch legs|each leg|left and right leg|right and left leg|double kick)\b/.test(
      tokens
    )
  ) {
    return false;
  }
  const sides = legSideAffinitySet(mod);
  if (sides.has('left') && sides.has('right')) return false;
  if (sides.size === 0) return false;
  if (sides.has('left')) return workingSide === 'left';
  if (sides.has('right')) return workingSide === 'right';
  return false;
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

type LimbContext = {
  flags: MissingLimbFlags;
  limitationsText: string;
  noArms: boolean;
  noLegs: boolean;
  bothArms: boolean;
  bothLegs: boolean;
};

/** Single source of truth for limb-impairment flags used by both scoring and accessibility filtering. */
function deriveLimbContext(profile: SkillProfile): LimbContext {
  const limitationsText = `${profile.physicalAttributes.limitations ?? ''} ${profile.fitnessCapabilities.injuries ?? ''}`.toLowerCase();
  const flags = parseMissingLimbFlags(limitationsText);
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
  return {
    flags,
    limitationsText,
    noArms,
    noLegs,
    bothArms: bothArmsUnavailable(flags, limitationsText, noArms),
    bothLegs: bothLegsUnavailable(flags, limitationsText, noLegs),
  };
}

function hasNoLimbLimitationsForRecommendations(ctx: LimbContext): boolean {
  return (
    !ctx.noArms &&
    !ctx.noLegs &&
    !ctx.bothArms &&
    !ctx.bothLegs &&
    !ctx.flags.leftArmMissing &&
    !ctx.flags.rightArmMissing &&
    !ctx.flags.leftLegMissing &&
    !ctx.flags.rightLegMissing
  );
}

/** True when onboarding lists every preferred technique (all five). */
export function userSelectedAllFiveTechniques(profile: SkillProfile | null): boolean {
  if (!profile?.preferences?.preferredTechnique?.length) return false;
  const sel = new Set(
    profile.preferences.preferredTechnique.map((t) => (t ?? '').trim()).filter(Boolean)
  );
  return CANONICAL_TECHNIQUE_PREF_LABELS.every((k) => sel.has(k));
}

/** True when recommendations should include one strong pick per `ALL_FIVE_RECOMMENDATION_CATEGORY_ORDER`. */
export function shouldRecommendOneModulePerCategoryDiversity(profile: SkillProfile | null): boolean {
  if (!profile) return false;
  if (!userSelectedAllFiveTechniques(profile)) return false;
  return hasNoLimbLimitationsForRecommendations(deriveLimbContext(profile));
}

/**
 * When the user narrowed techniques and has **no** limb impairment, only recommend modules in the
 * categories they chose. If nothing matches (should be rare), keep the accessible pool so scoring
 * can still surface alternatives.
 */
function filterCandidatesByExplicitTechniquePreferences(
  profile: SkillProfile | null,
  modules: ModuleItem[]
): ModuleItem[] {
  if (!profile) return modules;
  const prefs = profile.preferences.preferredTechnique ?? [];
  if (prefs.length === 0) return modules;
  if (userSelectedAllFiveTechniques(profile)) return modules;

  const ctx = deriveLimbContext(profile);
  if (!hasNoLimbLimitationsForRecommendations(ctx)) {
    return modules;
  }

  const matched = modules.filter((m) =>
    categoryMatchesPreferredTechnique(profile, (m.category ?? '').trim().toLowerCase())
  );
  return matched.length > 0 ? matched : modules;
}

/** Selected at least four of the five main technique families (punch, kick, elbow, knee, defensive). */
function hasBroadTechniquePreferences(profile: SkillProfile): boolean {
  const prefs = profile.preferences.preferredTechnique ?? [];
  if (prefs.length < 4) return false;
  let punch = false;
  let kick = false;
  let elbow = false;
  let knee = false;
  let defensive = false;
  for (const t of prefs) {
    const s = (t ?? '').toLowerCase();
    if (s.includes('punch')) punch = true;
    if (s.includes('kick')) kick = true;
    if (s.includes('elbow')) elbow = true;
    if (s.includes('knee')) knee = true;
    if (s.includes('defensive')) defensive = true;
  }
  return [punch, kick, elbow, knee, defensive].filter(Boolean).length >= 4;
}

/** Complete beginner with modest fitness — not high athlete tier. */
function isNoviceNonAthletic(profile: SkillProfile): boolean {
  const fit = profile.fitnessCapabilities.currentFitnessLevel;
  return (
    profile.pastExperience.experienceLevel === 'Complete Beginner' &&
    (fit === 'Low' || fit === 'Moderate')
  );
}

/**
 * When nothing blocks training (no limb flags), user picked almost everything, and they are a true novice:
 * gently favour basic / low-intensity modules so plyometric or advanced items don't lead the list.
 */
function noviceBroadPrefsEaseMultiplier(mod: ModuleItem, profile: SkillProfile, ctx: LimbContext): number {
  if (!hasNoLimbLimitationsForRecommendations(ctx)) return 1;
  if (!hasBroadTechniquePreferences(profile)) return 1;
  if (!isNoviceNonAthletic(profile)) return 1;

  const intensity = effectiveIntensity(mod);
  const d = (mod.difficultyLevel ?? '').toString().toLowerCase();
  const demandHeavy = (mod.physicalDemandTags ?? []).some((t) => HIGH_DEMAND_TAGS.has(String(t)));

  const readsBasic =
    intensity <= 2 || d === 'basic' || (intensity === 3 && d !== 'advanced' && !demandHeavy);
  const readsHard =
    intensity >= 4 ||
    d === 'advanced' ||
    (intensity >= 3 && demandHeavy);

  if (readsBasic && !readsHard) return 1.14;
  if (readsHard) return 0.87;
  return 1.0;
}

/**
 * Tier ordering for recommendations (1 = pick first). Rules:
 * - **Any arm limitation** (one arm missing, both arms, or broad “no arms”) while legs can still strike:
 *   kicks/knees first (side-safe items via `isModuleAccessible`), then defensive, then punching/elbow.
 * - Arm limitation but **no** usable legs (wheelchair / both legs): defensive + whatever upper-body remains viable.
 * - **Leg-only** impairment (arms OK): unchanged — good-leg strikes vs upper prefs as before.
 * - Otherwise: preference match tier 1, else tier 2.
 */
function limbAwareRecommendationTier(category: string, profile: SkillProfile, ctx: LimbContext): 1 | 2 | 3 {
  const cat = category.trim().toLowerCase();
  const explicitPrefs = (profile.preferences.preferredTechnique?.length ?? 0) > 0;

  const severeArmLimitation = ctx.bothArms || ctx.noArms;
  const armsFine = !ctx.bothArms && !ctx.noArms;
  const legImpaired =
    ctx.flags.leftLegMissing || ctx.flags.rightLegMissing || ctx.bothLegs || ctx.noLegs;

  const prefMatch = explicitPrefs ? categoryMatchesPreferredTechnique(profile, cat) : true;

  const armLimited =
    severeArmLimitation || ctx.flags.leftArmMissing || ctx.flags.rightArmMissing;

  /** User can still train kicking/kneeing (not wheelchair / both-legs loss). */
  const legsCanStrike = !ctx.bothLegs && !ctx.noLegs;

  // Arm limitation + legs available: always prioritize lower-body modules over strikes that need the arms.
  if (armLimited && legsCanStrike) {
    if (LEG_CATEGORIES.has(cat)) return 1;
    if (cat === 'defensive moves') return 2;
    if (UPPER_BODY_STRIKE_CATEGORIES.has(cat)) return 3;
    return 2;
  }

  // Arm limitation but cannot train legs: only upper-body / defensive pool left.
  if (armLimited && !legsCanStrike) {
    if (cat === 'defensive moves') return 1;
    if (UPPER_BODY_STRIKE_CATEGORIES.has(cat)) return 2;
    if (LEG_CATEGORIES.has(cat)) return 3;
    return 2;
  }

  const wantsUpperPref = prefersUpperBodyTechniques(profile);
  const wantsLegPref = prefersLegTechniques(profile);

  // No preferred techniques set: leg impairment → strikes on the good leg first, then upper body.
  if (!explicitPrefs) {
    if (legImpaired && armsFine) {
      if (LEG_CATEGORIES.has(cat)) return 1;
      return 2;
    }
    return 1;
  }

  // Leg impairment + arms usable: leg-first **unless** user only asked for upper prefs.
  if (legImpaired && armsFine) {
    if (wantsUpperPref && !wantsLegPref) {
      if ((UPPER_BODY_STRIKE_CATEGORIES.has(cat) || cat === 'defensive moves') && prefMatch) return 1;
      if (LEG_CATEGORIES.has(cat)) return 2;
      if (UPPER_BODY_STRIKE_CATEGORIES.has(cat) || cat === 'defensive moves') return 2;
      return 3;
    }
    if (wantsLegPref && !wantsUpperPref) {
      if (LEG_CATEGORIES.has(cat)) return 1;
      return 2;
    }
    if (wantsUpperPref && wantsLegPref) {
      if (
        prefMatch &&
        (UPPER_BODY_STRIKE_CATEGORIES.has(cat) || LEG_CATEGORIES.has(cat) || cat === 'defensive moves')
      ) {
        return 1;
      }
      if (LEG_CATEGORIES.has(cat)) return 2;
      if (UPPER_BODY_STRIKE_CATEGORIES.has(cat) || cat === 'defensive moves') return 2;
      return 3;
    }
    // Odd labels or empty-ish list: default leg strikes (good side only via accessibility) then upper.
    if (LEG_CATEGORIES.has(cat)) return 1;
    return 2;
  }

  return prefMatch ? 1 : 2;
}

/**
 * Hard accessibility filter: returns `false` for modules the user physically cannot perform.
 * Used to keep impossible categories out of recommendations entirely (not just downranked).
 * Single missing leg: only kicking/knee modules that explicitly match the **remaining** leg
 * (lead/left vs rear/right); ambiguous or bilateral leg content is excluded.
 */
export function isModuleAccessible(profile: SkillProfile | null, mod: ModuleItem): boolean {
  if (!profile) return true;
  const ctx = deriveLimbContext(profile);
  const category = (mod.category ?? '').trim().toLowerCase();
  if (ctx.bothLegs && LEG_CATEGORIES.has(category)) return false;
  if (ctx.bothArms && UPPER_BODY_STRIKE_CATEGORIES.has(category)) return false;
  const kickingLeg = usableKickingLegSide(ctx.flags, ctx.bothLegs);
  if (kickingLeg && LEG_CATEGORIES.has(category)) {
    if (!singleRemainingLegAllowsLegModule(mod, kickingLeg)) return false;
  }
  return true;
}

function prefRequiresArmsForTechnique(p: string): boolean {
  const s = p.toLowerCase();
  return s.includes('punch') || s.includes('elbow');
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

  // Single-limb impairment: when prefs only target the impaired family, lightly boost
  // viable alternative categories so the user still sees variety they can train.
  // If the user listed explicit preferred techniques, only boost categories they actually
  // selected — otherwise e.g. "punching + elbow only" still gets knee/defensive promoted.
  const oneArmImpaired =
    !bothArms && (missingLimbFlags.leftArmMissing || missingLimbFlags.rightArmMissing);
  const oneLegImpaired =
    !bothLegs && (missingLimbFlags.leftLegMissing || missingLimbFlags.rightLegMissing);

  const allowVarietyBoost =
    prefs.length === 0 || categoryMatchesPreferredTechnique(profile, category);

  if (oneArmImpaired && onlyArmStrikePrefs && allowVarietyBoost) {
    if (LEG_CATEGORIES.has(category) || category === 'defensive moves') {
      ts = Math.max(ts, 0.65);
    }
  }
  if (oneLegImpaired && onlyLegStrikePrefs && allowVarietyBoost) {
    if (ARM_SIDE_RELEVANT_CATEGORIES.has(category)) {
      ts = Math.max(ts, 0.65);
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
    // Arm-strike modules with no detectable side are risky when an arm is missing —
    // demote rather than treat as neutral. Defensive moves can usually be done with
    // the remaining arm, so they stay neutral when side is unknown.
    if (ARM_CATEGORIES.has(category)) {
      if (armSides.size === 0) return 0.55;
      if (armSides.has('left') && armSides.has('right')) return 0.78;
      if (onlyLeftArmGone) {
        if (armSides.has('right')) return 1.22;
        if (armSides.has('left')) return 0.45;
      }
      if (onlyRightArmGone) {
        if (armSides.has('left')) return 1.22;
        if (armSides.has('right')) return 0.45;
      }
    } else if (category === 'defensive moves') {
      if (armSides.size === 0) return 1.0;
      if (armSides.has('left') && armSides.has('right')) return 0.92;
      if (onlyLeftArmGone) {
        if (armSides.has('right')) return 1.18;
        if (armSides.has('left')) return 0.7;
      }
      if (onlyRightArmGone) {
        if (armSides.has('left')) return 1.18;
        if (armSides.has('right')) return 0.7;
      }
    }
  }

  const onlyLeftLegGone = flags.leftLegMissing && !flags.rightLegMissing;
  const onlyRightLegGone = flags.rightLegMissing && !flags.leftLegMissing;

  if (onlyLeftLegGone || onlyRightLegGone) {
    const legSides = legSideAffinitySet(mod);
    if (LEG_CATEGORIES.has(category)) {
      // Leg modules with no detectable side are risky when a leg is missing — demote
      // strongly so unlabelled kicks/knees stop competing with usable alternatives.
      if (legSides.size === 0) return 0.45;
      if (legSides.has('left') && legSides.has('right')) return 0.7;
      if (onlyLeftLegGone) {
        if (legSides.has('right')) return 1.22;
        if (legSides.has('left')) return 0.35;
      }
      if (onlyRightLegGone) {
        if (legSides.has('left')) return 1.22;
        if (legSides.has('right')) return 0.35;
      }
    }
  }

  return 1.0;
}

/**
 * Goal → category affinity. Goal labels (Personal Safety / Fitness / Confidence Building) never
 * literally appear in module categories, so the previous `category.includes(goal)` substring match
 * always returned the neutral 0.5 fallback. This replaces it with curated weights.
 */
const GOAL_CATEGORY_AFFINITY: Record<string, Record<string, number>> = {
  'personal safety': {
    'defensive moves': 1.0,
    'punching': 0.85,
    'elbow strikes': 0.85,
    'knee strikes': 0.85,
    'kicking': 0.7,
  },
  'fitness': {
    'kicking': 0.95,
    'knee strikes': 0.9,
    'punching': 0.9,
    'elbow strikes': 0.75,
    'defensive moves': 0.6,
  },
  'confidence building': {
    'defensive moves': 0.95,
    'punching': 0.85,
    'elbow strikes': 0.75,
    'kicking': 0.7,
    'knee strikes': 0.7,
  },
};

function goalsAffinityScore(goals: string[] | undefined, category: string): number {
  if (!category || !goals?.length) return 0.5;
  let best = 0.5;
  for (const g of goals) {
    if (!g) continue;
    const map = GOAL_CATEGORY_AFFINITY[g.toLowerCase().trim()];
    if (!map) continue;
    const score = map[category];
    if (typeof score === 'number' && score > best) best = score;
  }
  return best;
}

/**
 * Smooth intensity falloff: peaks at the user's preferred level, gentle decline either side
 * with a slightly steeper drop above (don't recommend much harder). Replaces the previous
 * hard cliff at `preferred + 1`.
 */
function intensityFitScore(intensity: number, preferred: number): number {
  const diff = intensity - preferred;
  const sigma = diff >= 0 ? 1.6 : 1.9;
  const score = Math.exp(-(diff * diff) / (2 * sigma * sigma));
  return Math.max(0.2, Math.min(1.0, score));
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
  const intensityScore = intensityFitScore(intensity, preferred);

  const matchedPreferredTechnique = categoryMatchesPreferredTechnique(profile, category);
  let techniqueScore = matchedPreferredTechnique ? 1.0 : 0.5;

  const ctx = deriveLimbContext(profile);
  const { flags: missingLimbFlags, limitationsText, noArms, noLegs } = ctx;
  const hasLimitations = Boolean(
    (profile.physicalAttributes.limitations ?? '').trim() || (profile.fitnessCapabilities.injuries ?? '').trim()
  );

  techniqueScore = applyLimbAwareTechniqueAdjustments(
    techniqueScore,
    profile,
    category,
    missingLimbFlags,
    limitationsText,
    noArms,
    noLegs
  );

  const explicitTechniquePrefs = (profile.preferences.preferredTechnique?.length ?? 0) > 0;
  if (
    explicitTechniquePrefs &&
    !matchedPreferredTechnique &&
    techniqueScore < ALTERNATIVE_TECHNIQUE_BOOST_THRESHOLD
  ) {
    techniqueScore = Math.min(techniqueScore, 0.14);
  }

  const goalsScore = goalsAffinityScore(profile.preferences.trainingGoal, category);
  let wantsScore: number;
  if (
    explicitTechniquePrefs &&
    !matchedPreferredTechnique &&
    techniqueScore < ALTERNATIVE_TECHNIQUE_BOOST_THRESHOLD
  ) {
    wantsScore = 0.15 * goalsScore + 0.08 * techniqueScore;
  } else {
    wantsScore = (techniqueScore + goalsScore) / 2;
  }

  let capabilityPenalty = 1.0;
  if (hasLimitations && [...physicalDemandTags].some((t) => HIGH_DEMAND_TAGS.has(t))) {
    capabilityPenalty = 0.7;
  }

  if (noArms && ARM_CATEGORIES.has(category)) capabilityPenalty = Math.min(capabilityPenalty, 0.4);
  if (noLegs && LEG_CATEGORIES.has(category)) capabilityPenalty = Math.min(capabilityPenalty, 0.4);

  // Single-limb impairment also caps leg/arm strike scores so unknown-side modules
  // can't quietly outrank usable alternatives.
  const oneArmImpaired =
    !noArms && (missingLimbFlags.leftArmMissing || missingLimbFlags.rightArmMissing);
  const oneLegImpaired =
    !noLegs && (missingLimbFlags.leftLegMissing || missingLimbFlags.rightLegMissing);
  if (oneArmImpaired && ARM_CATEGORIES.has(category)) {
    capabilityPenalty = Math.min(capabilityPenalty, 0.7);
  }
  if (oneLegImpaired && LEG_CATEGORIES.has(category)) {
    capabilityPenalty = Math.min(capabilityPenalty, 0.6);
  }

  const combined = 0.6 * intensityScore + 0.4 * wantsScore;
  const limbFit = limbFunctionalFitMultiplier(mod, category, missingLimbFlags, limitationsText, noArms, noLegs);
  const noviceEase = noviceBroadPrefsEaseMultiplier(mod, profile, ctx);
  return Math.max(0, Math.min(1, combined * capabilityPenalty * limbFit * noviceEase));
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

type ScoredRecommendationRow = {
  moduleId: string;
  total: number;
  profileScore: number;
  mlScore: number;
  strScore: number;
};

/**
 * Highest-scoring module per category bucket (for all-five + no limb limits).
 * Return order follows `ALL_FIVE_RECOMMENDATION_CATEGORY_ORDER` so the row reads punch → kick → elbow → knee → defense.
 */
function pickBestPerModuleCategoryBucket(
  scoredDesc: ScoredRecommendationRow[],
  categoryByModuleId: Map<string, string>
): string[] {
  const picked: ScoredRecommendationRow[] = [];
  const seen = new Set<string>();
  for (const bucket of ALL_FIVE_RECOMMENDATION_CATEGORY_ORDER) {
    for (const row of scoredDesc) {
      if (seen.has(row.moduleId)) continue;
      if ((categoryByModuleId.get(row.moduleId) ?? '') === bucket) {
        picked.push(row);
        seen.add(row.moduleId);
        break;
      }
    }
  }
  return picked.map((r) => r.moduleId);
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

/**
 * Per-extra-pick category penalty for MMR diversity rerank. Small enough that a clearly better
 * module can still win against a same-category neighbour, but large enough to break category
 * monocultures (e.g. five punching modules in a row).
 */
const DIVERSITY_PENALTY = 0.06;

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

  let candidates = modules.filter(
    (m) => m.moduleId && !completed.has(m.moduleId) && isModuleAccessible(skillProfile, m)
  );
  candidates = filterCandidatesByExplicitTechniquePreferences(skillProfile, candidates);
  if (candidates.length === 0) return [];

  const hasExplicitTechniquePrefs =
    Boolean(skillProfile?.preferences?.preferredTechnique?.length);
  const mixedExplicitTechniques =
    Boolean(skillProfile) &&
    hasExplicitTechniquePrefs &&
    (skillProfile?.preferences.preferredTechnique?.length ?? 0) > 1 &&
    !userSelectedAllFiveTechniques(skillProfile);

  let weights = inPerformancePhase
    ? { profile: 0.32, ml: 0.28, struggle: 0.4 }
    : { profile: 0.52, ml: 0.38, struggle: 0.1 };
  if (mixedExplicitTechniques) {
    weights = inPerformancePhase
      ? { profile: 0.38, ml: 0.24, struggle: 0.38 }
      : { profile: 0.58, ml: 0.32, struggle: 0.1 };
  }

  const categoryByModuleId = new Map<string, string>();
  for (const m of candidates) {
    categoryByModuleId.set(m.moduleId, (m.category ?? '').trim().toLowerCase());
  }

  /** User chose exactly one technique bucket (e.g. only "Punching") — keep ML/struggle from leaking other categories. */
  const singleExplicitTechniqueOnly =
    hasExplicitTechniquePrefs &&
    skillProfile &&
    (skillProfile.preferences.preferredTechnique?.length ?? 0) === 1;

  const scored = candidates.map((mod) => {
    const profileScore = skillProfile ? profileModuleFit(skillProfile, mod) : 0.48;
    const mlScore = mlBoost(mod.moduleId, mlRecommendedModuleIds);
    const fails = moduleTrainingStats[mod.moduleId]?.failCount ?? 0;
    const strScore = struggleBoost(fails, completedCount);
    const cat = (mod.category ?? '').trim().toLowerCase();
    const prefAligned =
      !hasExplicitTechniquePrefs ||
      !skillProfile ||
      categoryMatchesPreferredTechnique(skillProfile, cat);
    const mlFactor = prefAligned ? 1 : singleExplicitTechniqueOnly ? 0.08 : 0.22;
    const strFactor = prefAligned ? 1 : singleExplicitTechniqueOnly ? 0.18 : 0.28;
    const total =
      weights.profile * profileScore + weights.ml * mlScore * mlFactor + weights.struggle * strScore * strFactor;
    return { moduleId: mod.moduleId, total, profileScore, mlScore, strScore };
  });

  // Stable order: total desc, then preference alignment, profile (capabilities + prefs), ML, id.
  scored.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (skillProfile) {
      const ca = categoryByModuleId.get(a.moduleId) ?? '';
      const cb = categoryByModuleId.get(b.moduleId) ?? '';
      const pa = categoryMatchesPreferredTechnique(skillProfile, ca) ? 1 : 0;
      const pb = categoryMatchesPreferredTechnique(skillProfile, cb) ? 1 : 0;
      if (pb !== pa) return pb - pa;
    }
    if (b.profileScore !== a.profileScore) return b.profileScore - a.profileScore;
    if (b.mlScore !== a.mlScore) return b.mlScore - a.mlScore;
    return a.moduleId.localeCompare(b.moduleId);
  });

  const diversitySeedIds = shouldRecommendOneModulePerCategoryDiversity(skillProfile)
    ? pickBestPerModuleCategoryBucket(scored, categoryByModuleId)
    : [];

  const tier1: typeof scored = [];
  const tier2: typeof scored = [];
  const tier3: typeof scored = [];
  if (skillProfile) {
    const ctx = deriveLimbContext(skillProfile);
    for (const row of scored) {
      const cat = categoryByModuleId.get(row.moduleId) ?? '';
      const t = limbAwareRecommendationTier(cat, skillProfile, ctx);
      if (t === 1) tier1.push(row);
      else if (t === 2) tier2.push(row);
      else tier3.push(row);
    }
  } else {
    tier1.push(...scored);
  }

  // MMR-style diversity rerank. Limb-aware tiers run first (punch/elbow before defensive before
  // leg supplements when arms are fine but legs are impaired; legs before defensive when arms are not).
  const out: string[] = [];
  const seen = new Set<string>();
  const usedCategoryCount = new Map<string, number>();

  for (const id of diversitySeedIds) {
    if (out.length >= topN) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    const cat = categoryByModuleId.get(id) ?? '';
    usedCategoryCount.set(cat, (usedCategoryCount.get(cat) ?? 0) + 1);
  }

  const diversityPenaltyEffective =
    skillProfile &&
    (skillProfile.preferences.preferredTechnique?.length ?? 0) === 1 &&
    (skillProfile.preferences.preferredTechnique?.[0] ?? '').trim().length > 0
      ? 0
      : DIVERSITY_PENALTY;

  const mmrPickFromPool = (pool: typeof scored) => {
    const remaining = pool.filter((r) => !seen.has(r.moduleId));
    while (out.length < topN && remaining.length > 0) {
      let bestIdx = 0;
      let bestAdjusted = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const row = remaining[i];
        const cat = categoryByModuleId.get(row.moduleId) ?? '';
        const repeats = usedCategoryCount.get(cat) ?? 0;
        const adjusted = row.total - diversityPenaltyEffective * repeats;
        if (adjusted > bestAdjusted) {
          bestAdjusted = adjusted;
          bestIdx = i;
        }
      }
      const picked = remaining.splice(bestIdx, 1)[0];
      if (seen.has(picked.moduleId)) continue;
      seen.add(picked.moduleId);
      out.push(picked.moduleId);
      const pickedCat = categoryByModuleId.get(picked.moduleId) ?? '';
      usedCategoryCount.set(pickedCat, (usedCategoryCount.get(pickedCat) ?? 0) + 1);
    }
  };

  mmrPickFromPool(tier1);
  if (out.length < topN) mmrPickFromPool(tier2);
  if (out.length < topN) mmrPickFromPool(tier3);

  return out;
}

/**
 * Standalone sanity-check for `buildPersonalizedModuleRecommendations`.
 * Runs without Firebase using a small mock catalog. Use for regression checks
 * after editing `lib/recommendations/trainingModuleRecommendations.ts`.
 *
 *   cd defendu-mobile
 *   npx --yes tsx scripts/check-recommendations.ts
 */
import type { ModuleItem } from '../lib/controllers/modulesCatalog';
import type { SkillProfile } from '../lib/models/SkillProfile';
import {
  buildPersonalizedModuleRecommendations,
  profileModuleFit,
} from '../lib/recommendations/trainingModuleRecommendations';

type ModuleSeed = Partial<ModuleItem> & { moduleId: string; category: string };

function mod(seed: ModuleSeed): ModuleItem {
  return {
    moduleTitle: seed.moduleId,
    description: '',
    intensityLevel: 3,
    physicalDemandTags: [],
    ...seed,
  } as ModuleItem;
}

const CATALOG: ModuleItem[] = [
  // Punching
  mod({ moduleId: 'jab',                    category: 'punching',        intensityLevel: 2, moduleTitle: 'Lead Jab' }),
  mod({ moduleId: 'cross',                  category: 'punching',        intensityLevel: 3, moduleTitle: 'Rear Cross' }),
  mod({ moduleId: 'left_hook',              category: 'punching',        intensityLevel: 3, moduleTitle: 'Left Hook' }),
  mod({ moduleId: 'right_hook',             category: 'punching',        intensityLevel: 3, moduleTitle: 'Right Hook' }),
  mod({ moduleId: 'combo_punches',          category: 'punching',        intensityLevel: 4, moduleTitle: 'Combo Punches', physicalDemandTags: ['Power', 'Speed'] }),

  // Elbow
  mod({ moduleId: 'lead_elbow',             category: 'elbow strikes',   intensityLevel: 3, moduleTitle: 'Lead Elbow' }),
  mod({ moduleId: 'rear_elbow',             category: 'elbow strikes',   intensityLevel: 4, moduleTitle: 'Rear Elbow' }),

  // Kicking
  mod({ moduleId: 'lead_low_kick',          category: 'kicking',         intensityLevel: 3, moduleTitle: 'Lead Low Kick' }),
  mod({ moduleId: 'rear_low_kick',          category: 'kicking',         intensityLevel: 3, moduleTitle: 'Rear Low Kick' }),
  mod({ moduleId: 'lead_high_kick',         category: 'kicking',         intensityLevel: 4, moduleTitle: 'Lead High Kick' }),
  mod({ moduleId: 'rear_high_kick',         category: 'kicking',         intensityLevel: 4, moduleTitle: 'Rear High Kick' }),
  mod({ moduleId: 'roundhouse_kick',        category: 'kicking',         intensityLevel: 3, moduleTitle: 'Roundhouse Kick',  description: 'Classic roundhouse rotation.' }),
  mod({ moduleId: 'side_kick',              category: 'kicking',         intensityLevel: 3, moduleTitle: 'Side Kick',        description: 'Linear side kick.' }),
  mod({ moduleId: 'front_kick',             category: 'kicking',         intensityLevel: 2, moduleTitle: 'Front Kick',       description: 'Push kick.' }),

  // Knee strikes
  mod({ moduleId: 'lead_knee',              category: 'knee strikes',    intensityLevel: 3, moduleTitle: 'Lead Knee Strike' }),
  mod({ moduleId: 'rear_knee',              category: 'knee strikes',    intensityLevel: 3, moduleTitle: 'Rear Knee Strike' }),
  mod({ moduleId: 'plyo_knee',              category: 'knee strikes',    intensityLevel: 5, moduleTitle: 'Flying Knee',      physicalDemandTags: ['Power', 'Agility'] }),
  mod({ moduleId: 'knee_strike_basic',      category: 'knee strikes',    intensityLevel: 2, moduleTitle: 'Knee Strike',      description: 'Basic standing knee.' }),

  // Defensive
  mod({ moduleId: 'slip_left',              category: 'defensive moves', intensityLevel: 2, moduleTitle: 'Slip Left' }),
  mod({ moduleId: 'slip_right',             category: 'defensive moves', intensityLevel: 2, moduleTitle: 'Slip Right' }),
  mod({ moduleId: 'parry',                  category: 'defensive moves', intensityLevel: 2, moduleTitle: 'Parry' }),
];

function profile(over: Partial<SkillProfile> & {
  experienceLevel?: string;
  fitnessLevel?: string;
  preferredTechnique?: string[];
  trainingGoal?: string[];
  limitations?: string;
  injuries?: string;
}): SkillProfile {
  return {
    uid: over.uid ?? 'test',
    physicalAttributes: {
      height: 175,
      weight: 70,
      age: 28,
      gender: 'Male',
      limitations: over.limitations ?? '',
    },
    preferences: {
      preferredTechnique: over.preferredTechnique ?? [],
      trainingGoal: over.trainingGoal ?? [],
      targetModulesPerDay: 5,
      targetModulesPerWeek: 35,
    },
    pastExperience: {
      experienceLevel: over.experienceLevel ?? 'Some Experience',
      martialArtsBackground: [],
      previousTrainingDetails: '',
    },
    fitnessCapabilities: {
      currentFitnessLevel: over.fitnessLevel ?? 'Moderate',
      trainingFrequency: '1-2 times per week',
      injuries: over.injuries ?? '',
    },
    completedAt: new Date(),
  } as SkillProfile;
}

type Persona = {
  name: string;
  profile: SkillProfile;
  expectations: string[];
};

const PERSONAS: Persona[] = [
  {
    name: 'No right leg + Knee Strikes preference (the bug report)',
    profile: profile({
      uid: 'persona_no_right_leg',
      preferredTechnique: ['Knee Strikes'],
      trainingGoal: ['Personal Safety'],
      limitations: 'no right leg',
      experienceLevel: 'Some Experience',
      fitnessLevel: 'Moderate',
    }),
    expectations: [
      'Top picks should NOT include rear-leg modules (rear_low_kick, rear_high_kick, rear_knee).',
      'Lead-leg modules (lead_low_kick, lead_high_kick, lead_knee) should rank higher than rear ones.',
      'Side-unknown leg modules (roundhouse_kick, side_kick, front_kick, knee_strike_basic) should be demoted vs lead-leg.',
    ],
  },
  {
    name: 'No left arm + Boxing prefs',
    profile: profile({
      uid: 'persona_no_left_arm',
      preferredTechnique: ['Punching'],
      trainingGoal: ['Fitness'],
      limitations: 'no left arm',
    }),
    expectations: [
      'Lead/jab punches should be downranked, rear/cross punches boosted.',
      'Side-unknown punches (combo_punches) should be demoted.',
    ],
  },
  {
    name: 'Wheelchair user (no legs broad)',
    profile: profile({
      uid: 'persona_wheelchair',
      preferredTechnique: ['Punching', 'Elbow Strikes'],
      trainingGoal: ['Personal Safety'],
      limitations: 'wheelchair user, upper body only',
    }),
    expectations: [
      'No kicking or knee strike modules in top 5.',
      'Top picks should be punching / elbow.',
    ],
  },
  {
    name: 'Wheelchair user with leg-only prefs (Kicking + Knee Strikes)',
    profile: profile({
      uid: 'persona_wheelchair_leg_prefs',
      preferredTechnique: ['Kicking', 'Knee Strikes'],
      trainingGoal: ['Personal Safety'],
      limitations: 'wheelchair user, upper body only',
    }),
    expectations: [
      'No kicking or knee strike modules in top 5 (hard accessibility filter).',
      'Top 5 should be filled with viable upper-body / defensive modules.',
    ],
  },
  {
    name: 'No arms (broad) with arm-only prefs (Punching)',
    profile: profile({
      uid: 'persona_no_arms_arm_prefs',
      preferredTechnique: ['Punching'],
      trainingGoal: ['Personal Safety'],
      limitations: 'no arms',
    }),
    expectations: [
      'No punching / elbow modules in top 5 (hard accessibility filter).',
      'Top 5 should be filled with viable kicking / defensive modules.',
    ],
  },
  {
    name: 'Beginner low fitness, broad prefs',
    profile: profile({
      uid: 'persona_beginner',
      preferredTechnique: ['Punching', 'Defensive Moves'],
      trainingGoal: ['Personal Safety', 'Fitness'],
      experienceLevel: 'Complete Beginner',
      fitnessLevel: 'Low',
    }),
    expectations: [
      'Lower-intensity modules should dominate.',
      'High-intensity modules (combo_punches, plyo_knee, lead_high_kick) should not lead.',
    ],
  },
  {
    name: 'Athlete expert, all prefs',
    profile: profile({
      uid: 'persona_athlete',
      preferredTechnique: ['Punching', 'Kicking', 'Knee Strikes', 'Elbow Strikes', 'Defensive Moves'],
      trainingGoal: ['Fitness', 'Personal Safety'],
      experienceLevel: 'Expert/Instructor',
      fitnessLevel: 'Athlete',
    }),
    expectations: [
      'Higher intensity modules should be allowed in the top 5.',
    ],
  },
];

function format(score: number): string {
  return score.toFixed(3);
}

function rankAll(p: SkillProfile) {
  return CATALOG.map((m) => ({
    moduleId: m.moduleId,
    category: m.category ?? '',
    intensity: m.intensityLevel ?? 3,
    score: profileModuleFit(p, m),
  })).sort((a, b) => b.score - a.score);
}

function topRecommendations(p: SkillProfile): string[] {
  return buildPersonalizedModuleRecommendations({
    modules: CATALOG,
    skillProfile: p,
    completedModuleIds: [],
    moduleTrainingStats: {},
    mlRecommendedModuleIds: [],
    topN: 5,
  });
}

function check(label: string, ok: boolean, detail?: string): boolean {
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${label}${detail ? ` -> ${detail}` : ''}`);
  return ok;
}

function runRegressionAssertions(): boolean {
  let allOk = true;
  console.log('\nRegression assertions:');

  // Bug report: no right leg + knee prefs.
  const noRightLeg = PERSONAS[0].profile;
  const ranked = rankAll(noRightLeg);
  const scoreOf = (id: string) => ranked.find((r) => r.moduleId === id)?.score ?? 0;
  const top5 = topRecommendations(noRightLeg);

  allOk = check(
    'no_right_leg: rear_low_kick is NOT in top 5',
    !top5.includes('rear_low_kick'),
    `top5 = ${top5.join(', ')}`
  ) && allOk;
  allOk = check(
    'no_right_leg: rear_high_kick is NOT in top 5',
    !top5.includes('rear_high_kick'),
    `top5 = ${top5.join(', ')}`
  ) && allOk;
  allOk = check(
    'no_right_leg: rear_knee is NOT in top 5',
    !top5.includes('rear_knee'),
    `top5 = ${top5.join(', ')}`
  ) && allOk;
  allOk = check(
    'no_right_leg: lead_low_kick scores higher than rear_low_kick',
    scoreOf('lead_low_kick') > scoreOf('rear_low_kick'),
    `lead=${format(scoreOf('lead_low_kick'))} vs rear=${format(scoreOf('rear_low_kick'))}`
  ) && allOk;
  allOk = check(
    'no_right_leg: lead_low_kick scores higher than side-unknown roundhouse_kick',
    scoreOf('lead_low_kick') > scoreOf('roundhouse_kick'),
    `lead=${format(scoreOf('lead_low_kick'))} vs roundhouse=${format(scoreOf('roundhouse_kick'))}`
  ) && allOk;
  allOk = check(
    'no_right_leg: side-unknown roundhouse_kick scores higher than rear_low_kick',
    scoreOf('roundhouse_kick') > scoreOf('rear_low_kick'),
    `roundhouse=${format(scoreOf('roundhouse_kick'))} vs rear=${format(scoreOf('rear_low_kick'))}`
  ) && allOk;

  // No left arm: cross > jab.
  const noLeftArm = PERSONAS[1].profile;
  const armRanked = rankAll(noLeftArm);
  const armScoreOf = (id: string) => armRanked.find((r) => r.moduleId === id)?.score ?? 0;
  allOk = check(
    'no_left_arm: cross scores higher than jab',
    armScoreOf('cross') > armScoreOf('jab'),
    `cross=${format(armScoreOf('cross'))} vs jab=${format(armScoreOf('jab'))}`
  ) && allOk;
  allOk = check(
    'no_left_arm: cross scores higher than side-unknown combo_punches',
    armScoreOf('cross') > armScoreOf('combo_punches'),
    `cross=${format(armScoreOf('cross'))} vs combo=${format(armScoreOf('combo_punches'))}`
  ) && allOk;

  // Wheelchair: no leg modules in top 5.
  const wheelchair = PERSONAS[2].profile;
  const wcTop5 = topRecommendations(wheelchair);
  const legCats = new Set(['kicking', 'knee strikes']);
  const armCats = new Set(['punching', 'elbow strikes']);
  const wcLegLeak = wcTop5.filter((id) => {
    const m = CATALOG.find((x) => x.moduleId === id);
    return m && legCats.has((m.category ?? '').toLowerCase());
  });
  allOk = check(
    'wheelchair: no kicking/knee modules in top 5',
    wcLegLeak.length === 0,
    wcLegLeak.length ? `leaked: ${wcLegLeak.join(', ')}` : 'clean'
  ) && allOk;

  // Wheelchair with leg-only prefs: hard filter must still work.
  const wcLeg = PERSONAS[3].profile;
  const wcLegTop5 = topRecommendations(wcLeg);
  const wcLegLeak2 = wcLegTop5.filter((id) => {
    const m = CATALOG.find((x) => x.moduleId === id);
    return m && legCats.has((m.category ?? '').toLowerCase());
  });
  allOk = check(
    'wheelchair_leg_prefs: still no kicking/knee in top 5',
    wcLegLeak2.length === 0,
    wcLegLeak2.length ? `leaked: ${wcLegLeak2.join(', ')}` : `top5 = ${wcLegTop5.join(', ')}`
  ) && allOk;
  allOk = check(
    'wheelchair_leg_prefs: returns at least 3 viable upper-body/defensive modules',
    wcLegTop5.length >= 3,
    `top5 = ${wcLegTop5.join(', ')}`
  ) && allOk;

  // No arms with arm-only prefs: arm strikes filtered.
  const noArms = PERSONAS[4].profile;
  const noArmsTop5 = topRecommendations(noArms);
  const armLeak = noArmsTop5.filter((id) => {
    const m = CATALOG.find((x) => x.moduleId === id);
    return m && armCats.has((m.category ?? '').toLowerCase());
  });
  allOk = check(
    'no_arms_arm_prefs: no punching/elbow in top 5',
    armLeak.length === 0,
    armLeak.length ? `leaked: ${armLeak.join(', ')}` : `top5 = ${noArmsTop5.join(', ')}`
  ) && allOk;

  // Goals→category mapping: Personal Safety should boost defensive moves above plain punching
  // when both have similar profile fit (no preferred technique).
  const safetyOnly = profile({
    uid: 'persona_safety_goal',
    preferredTechnique: [],
    trainingGoal: ['Personal Safety'],
  });
  const safetyRanked = rankAll(safetyOnly);
  const defScore = safetyRanked.find((r) => r.moduleId === 'parry')?.score ?? 0;
  const punchScore = safetyRanked.find((r) => r.moduleId === 'jab')?.score ?? 0;
  allOk = check(
    'personal_safety goal: defensive moves outranks punching',
    defScore > punchScore,
    `parry=${format(defScore)} vs jab=${format(punchScore)}`
  ) && allOk;

  // Goals→category mapping: Fitness should boost kicking above defensive moves.
  const fitnessOnly = profile({
    uid: 'persona_fitness_goal',
    preferredTechnique: [],
    trainingGoal: ['Fitness'],
    fitnessLevel: 'High',
    experienceLevel: 'Some Experience',
  });
  const fitnessRanked = rankAll(fitnessOnly);
  const kickScore = fitnessRanked.find((r) => r.moduleId === 'lead_low_kick')?.score ?? 0;
  const slipScore = fitnessRanked.find((r) => r.moduleId === 'slip_left')?.score ?? 0;
  allOk = check(
    'fitness goal: kicking outranks defensive moves',
    kickScore > slipScore,
    `lead_low_kick=${format(kickScore)} vs slip_left=${format(slipScore)}`
  ) && allOk;

  // MMR diversity: top 5 for athlete with broad prefs should span at least 3 distinct categories.
  const athlete = PERSONAS[6].profile;
  const athleteTop5 = topRecommendations(athlete);
  const athleteCats = new Set(
    athleteTop5
      .map((id) => CATALOG.find((m) => m.moduleId === id)?.category?.toLowerCase())
      .filter(Boolean)
  );
  allOk = check(
    'mmr diversity: athlete top 5 spans >=3 distinct categories',
    athleteCats.size >= 3,
    `cats=${[...athleteCats].join(', ')} | top5=${athleteTop5.join(', ')}`
  ) && allOk;

  return allOk;
}

function dumpPersona(p: Persona): void {
  console.log(`\n=== ${p.name} ===`);
  console.log(`  prefs: ${p.profile.preferences.preferredTechnique.join(', ') || '(none)'}`);
  console.log(`  goals: ${p.profile.preferences.trainingGoal.join(', ') || '(none)'}`);
  if (p.profile.physicalAttributes.limitations) {
    console.log(`  limitations: ${p.profile.physicalAttributes.limitations}`);
  }
  const ranked = rankAll(p.profile);
  const top = ranked.slice(0, 8);
  console.log('  scored top 8 (profileModuleFit):');
  for (const r of top) {
    console.log(`    ${format(r.score)}  ${r.moduleId.padEnd(22)}  cat=${r.category}  intensity=${r.intensity}`);
  }
  const top5 = topRecommendations(p.profile);
  console.log(`  top 5 ids: ${top5.join(', ')}`);
  console.log('  expected:');
  for (const e of p.expectations) console.log(`    - ${e}`);
}

function main(): void {
  for (const p of PERSONAS) dumpPersona(p);
  const ok = runRegressionAssertions();
  console.log(`\n${ok ? 'All regression assertions passed.' : 'Some regression assertions FAILED.'}`);
  if (!ok) process.exit(1);
}

main();

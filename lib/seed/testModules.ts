/**
 * Test modules for seeding the database. Used by "Seed test modules" (trainers only).
 * Each module is assigned basic, intermediate, or advanced.
 */
export interface SeedModuleInput {
  moduleTitle: string;
  description: string;
  category: string;
  difficultyLevel: 'basic' | 'intermediate' | 'advanced';
  introduction?: string;
  videoDuration?: number;
}

export const SEED_TEST_MODULES: SeedModuleInput[] = [
  // Punching
  { moduleTitle: 'Jab fundamentals', description: 'Learn proper stance, extension, and retraction for the jab.', category: 'Punching', difficultyLevel: 'basic', introduction: 'The jab is the most important punch in striking. We will cover form and basic drills.' },
  { moduleTitle: 'Cross and hook combo', description: 'Combine the cross with lead and rear hooks for effective combinations.', category: 'Punching', difficultyLevel: 'intermediate', introduction: 'Building on your jab and cross, we add hooks and simple 3–4 punch combos.' },
  { moduleTitle: 'Advanced punch flow', description: 'Fluid combinations, feints, and punch-and-move patterns.', category: 'Punching', difficultyLevel: 'advanced', introduction: 'High-intensity flow drills and combination chains for experienced practitioners.' },
  // Kicking
  { moduleTitle: 'Front kick basics', description: 'Front kick from stance: chamber, extension, and recoil.', category: 'Kicking', difficultyLevel: 'basic', introduction: 'The front kick is a fundamental tool for distance and defense.' },
  { moduleTitle: 'Roundhouse kick fundamentals', description: 'Pivot, chamber, and hip drive for power roundhouse kicks.', category: 'Kicking', difficultyLevel: 'intermediate', introduction: 'Develop power and accuracy on the roundhouse to the body and leg.' },
  { moduleTitle: 'Spinning back kick', description: 'Set-up, turn, and delivery of the spinning back kick.', category: 'Kicking', difficultyLevel: 'advanced', introduction: 'An advanced power kick; we focus on timing and safe drilling.' },
  // Elbow Strikes
  { moduleTitle: 'Elbow strike introduction', description: 'Basic horizontal and vertical elbows from guard.', category: 'Elbow Strikes', difficultyLevel: 'basic', introduction: 'Elbows are powerful at close range. Learn the core angles first.' },
  { moduleTitle: 'Elbows from the clinch', description: 'Short elbows and framing from clinch range.', category: 'Elbow Strikes', difficultyLevel: 'intermediate', introduction: 'Apply elbows in clinch control and off breaks.' },
  { moduleTitle: 'Elbow combination flow', description: 'Chaining elbows with punches and off angles.', category: 'Elbow Strikes', difficultyLevel: 'advanced', introduction: 'Flowing between punches and elbows for infighting.' },
  // Palm Strikes
  { moduleTitle: 'Palm heel basics', description: 'Palm heel from stance: alignment, target, and follow-through.', category: 'Palm Strikes', difficultyLevel: 'basic', introduction: 'A safe and effective strike; great for self-defense basics.' },
  { moduleTitle: 'Palm strike combinations', description: 'Palm heels with stepping and simple combos.', category: 'Palm Strikes', difficultyLevel: 'intermediate', introduction: 'Combine palm heels with movement and follow-up strikes.' },
  { moduleTitle: 'Palm and defense flow', description: 'Palm strikes integrated with blocks and counters.', category: 'Palm Strikes', difficultyLevel: 'advanced', introduction: 'Defense-to-offense flow using palm strikes.' },
  // Defensive Moves
  { moduleTitle: 'Blocking basics', description: 'High and low blocks, guard position, and basic defense.', category: 'Defensive Moves', difficultyLevel: 'basic', introduction: 'Establish a solid defensive foundation with blocks and guard.' },
  { moduleTitle: 'Parry and slip', description: 'Parrying punches and slipping to the outside and inside.', category: 'Defensive Moves', difficultyLevel: 'intermediate', introduction: 'Redirect and evade instead of only blocking.' },
  { moduleTitle: 'Counter combinations', description: 'Block or slip then counter with punches and kicks.', category: 'Defensive Moves', difficultyLevel: 'advanced', introduction: 'Defensive responses that flow into offensive combinations.' },
];

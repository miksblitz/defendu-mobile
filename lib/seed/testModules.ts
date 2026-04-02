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
  referenceCode?: string;
  referencePoseFocus?: 'punching' | 'kicking' | 'full';
  hasReferencePose?: boolean;
  repRange?: string;
  trainingDurationSeconds?: number;
}

export const SEED_TEST_MODULES: SeedModuleInput[] = [
  { moduleTitle: 'Jab fundamentals', description: 'Learn proper stance, extension, and retraction for the jab.', category: 'Jab', difficultyLevel: 'basic', introduction: 'The jab is the most important punch in striking. We will cover form and basic drills.' },
  {
    moduleTitle: 'Blocking Fundamentals',
    description: 'Train normal stance to blocking transitions using defensive reference coordinates.',
    category: 'Defensive Moves',
    difficultyLevel: 'basic',
    introduction:
      'Reference code M0101. Start in normal stance, then raise guard into a proper blocking position while keeping base and balance.',
    referenceCode: 'M0101',
    referencePoseFocus: 'full',
    hasReferencePose: true,
    repRange: '8-12',
    trainingDurationSeconds: 60,
  },
];

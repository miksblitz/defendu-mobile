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
  { moduleTitle: 'Jab fundamentals', description: 'Learn proper stance, extension, and retraction for the jab.', category: 'Jab', difficultyLevel: 'basic', introduction: 'The jab is the most important punch in striking. We will cover form and basic drills.' },
];

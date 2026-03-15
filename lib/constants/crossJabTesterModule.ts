/**
 * Built-in "Cross Jab Test" module: cross jab (right hand punches, left in guard).
 * Mirror of Lead Jab Test (which uses left punch, right guard).
 * Optional reference from CSV for "Try with pose" comparison.
 */
import type { Module } from '../models/Module';

export const CROSS_JAB_TEST_MODULE_ID = 'cross-jab-tester';

const now = new Date();

export const CROSS_JAB_TEST_MODULE: Module = {
  moduleId: CROSS_JAB_TEST_MODULE_ID,
  trainerId: 'cross-jab-tester-app',
  moduleTitle: 'Cross Jab Test',
  description:
    'Practice cross jab: right hand extends straight out to the side, left hand stays in guard (contracted, wrist up). Each correct pose counts as 1 rep.',
  category: 'Punching',
  introductionType: 'text',
  introduction:
    'Cross jab: extend your RIGHT hand straight out to the side (not up or down). Keep your LEFT hand in guard—contracted by your face with the wrist facing up, not down. Hold the pose briefly for each rep to count.',
  referencePoseFocus: 'punching',
  repRange: '3',
  trainingDurationSeconds: 60,
  difficultyLevel: 'basic',
  status: 'approved',
  createdAt: now,
  updatedAt: now,
};

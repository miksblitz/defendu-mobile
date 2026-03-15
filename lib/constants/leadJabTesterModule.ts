/**
 * Built-in "Lead Jab Test" module: orthodox lead jab.
 * Correct rep = left hand extended straight sideways, right hand contracted with wrist up (guard).
 * No reference sequence; rep counted when pose matches.
 */
import type { Module } from '../models/Module';

export const LEAD_JAB_TEST_MODULE_ID = 'lead-jab-tester';

const now = new Date();

export const LEAD_JAB_TEST_MODULE: Module = {
  moduleId: LEAD_JAB_TEST_MODULE_ID,
  trainerId: 'lead-jab-tester-app',
  moduleTitle: 'Lead Jab Test',
  description:
    'Practice orthodox lead jab: left hand extends straight out to the side, right hand stays in guard (contracted, wrist up). Each correct pose counts as 1 rep.',
  category: 'Punching',
  introductionType: 'text',
  introduction:
    'Orthodox lead jab: extend your LEFT hand straight out to the side (not up or down). Keep your RIGHT hand in guard—contracted by your face with the wrist facing up, not down. Hold the pose briefly for each rep to count.',
  referencePoseFocus: 'punching',
  repRange: '3',
  trainingDurationSeconds: 60,
  difficultyLevel: 'basic',
  status: 'approved',
  createdAt: now,
  updatedAt: now,
};

/**
 * Built-in "Jab Tester" module for testing MediaPipe arm detection (extending/contracting).
 * Not stored in Firebase — opened via Dashboard "Jab Tester" button; ViewModuleScreen loads this when moduleId matches.
 */
import type { Module } from '../models/Module';

export const JAB_TESTER_MODULE_ID = 'jab-tester';

const now = new Date();

export const JAB_TESTER_MODULE: Module = {
  moduleId: JAB_TESTER_MODULE_ID,
  trainerId: 'jab-tester-app',
  moduleTitle: 'Jab Tester',
  description:
    'Test that MediaPipe detects your arms and shows extending/contracting in real time. Use "Try with pose" and keep your shoulders and wrists in frame.',
  category: 'Jab',
  introductionType: 'text',
  introduction:
    'This is a test module to verify pose detection. Tap "Try with pose" to open the camera. You should see an "Arm state" box with L/R distances and Left/Right extending or contracting as you move your arms.',
  referencePoseFocus: 'punching',
  repRange: '3',
  trainingDurationSeconds: 60,
  difficultyLevel: 'basic',
  status: 'approved',
  createdAt: now,
  updatedAt: now,
};

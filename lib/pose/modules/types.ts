/**
 * Per-module pose pipeline: comparator, rep detector, normalizer, phase detection, pose focus.
 * Each module folder under lib/pose/modules/<category>/<moduleId>/ exports code specific to that module.
 */

import type { PoseFrame, PoseSequence, PoseFocus, PoseFeedbackItem } from '../types';

export type RepDetectorResult =
  | { done: false }
  | { done: true; segment: PoseFrame[] };

export type RepDetectorTick = (frame: PoseFrame, now: number) => RepDetectorResult;

export interface ModulePosePipeline {
  /** Create the rep detector for this module (called once per pose session). */
  createRepDetector(): RepDetectorTick;
  /** Compare one user rep to one reference; returns match, distance, feedback. */
  compareRepWithFeedback(
    userFrames: PoseFrame[],
    referenceFrames: PoseFrame[],
    threshold: number,
    focus?: PoseFocus
  ): { match: boolean; distance: number; feedback: PoseFeedbackItem[] };
  /** Compare one user rep to multiple references; match if any passes. */
  compareRepWithFeedbackAny(
    userFrames: PoseFrame[],
    referenceSequences: PoseSequence[],
    threshold: number,
    focus?: PoseFocus
  ): { match: boolean; distance: number; feedback: PoseFeedbackItem[] };
  /** Default match threshold for this module. */
  defaultMatchThreshold: number;
  /** Default pose focus (punching / kicking / full). */
  poseFocus: PoseFocus;
  /** Minimum consecutive frames to count a rep (e.g. 3 for lead-jab, 5 for generic). */
  minFramesForRep: number;
}

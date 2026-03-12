/**
 * Pose types for the technique comparison feature.
 * Used with MediaPipe / TF.js pose output and reference sequences.
 */

export type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

/** One frame: array of landmarks (e.g. 33 for MediaPipe, 17 for MoveNet). */
export type PoseFrame = PoseLandmark[];

/** Sequence of frames (e.g. one rep or full reference). */
export type PoseSequence = PoseFrame[];

/** Stored reference for a module: one rep of correct technique. */
export type ReferencePoseSequence = {
  moduleId: string;
  frameCount: number;
  landmarksPerFrame: number;
  sequence: PoseSequence;
};

/** Which body region to use for rep detection and comparison (per technique). */
export type PoseFocus = 'punching' | 'kicking' | 'full';

/** Default focus when not specified in reference JSON. */
export const DEFAULT_POSE_FOCUS: PoseFocus = 'full';

/** Phases of a jab (or generic strike) for sequence comparison and feedback. */
export type JabPhase = 'guard' | 'extension' | 'impact' | 'recoil';

/** Bounds of a phase within a sequence: [startIndex, endIndex] (inclusive). */
export type PhaseBounds = { phase: JabPhase; start: number; end: number };

/** One rule-based feedback message (e.g. "Front hand not fully extended"). */
export type PoseFeedbackItem = {
  id: string;
  message: string;
  phase?: JabPhase;
  severity?: 'hint' | 'warning' | 'error';
};

/** Result of rule-based comparison: pass/fail and specific feedback. */
export type RuleBasedFeedbackResult = {
  passed: boolean;
  feedback: PoseFeedbackItem[];
  /** Optional overall distance for compatibility with threshold-based logic. */
  distance?: number;
};

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

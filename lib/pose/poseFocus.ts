/**
 * Pose focus: which landmarks to use for comparison and rep detection.
 * - punching: upper torso (shoulders, arms, wrists); legs ignored.
 * - kicking: legs (hips, knees, ankles, feet); upper body ignored.
 * - full: all 33 landmarks (default).
 * MediaPipe 33-landmark indices: 0 nose, 11/12 shoulders, 13/14 elbows, 15/16 wrists,
 * 23/24 hips, 25/26 knees, 27/28 ankles, 29-32 feet.
 */

import type { PoseFocus } from './types';
import type { PoseFrame } from './types';

/** Landmark indices per focus. Order preserved for consistent comparison. */
export const LANDMARK_INDICES_BY_FOCUS: Record<PoseFocus, number[]> = {
  punching: [0, 11, 12, 13, 14, 15, 16, 23, 24], // nose, shoulders, elbows, wrists, hips (base)
  kicking: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32], // hips, knees, ankles, feet
  full: Array.from({ length: 33 }, (_, i) => i),
};

/**
 * Subset a frame to only the landmarks for the given focus.
 * Returns a new frame (array of landmarks) so comparison uses only that region.
 */
export function subsetFrameByFocus(frame: PoseFrame, focus: PoseFocus): PoseFrame {
  const indices = LANDMARK_INDICES_BY_FOCUS[focus];
  return indices
    .filter((i) => i < frame.length)
    .map((i) => ({ ...frame[i]! }));
}

/**
 * Subset a sequence of frames by focus.
 */
export function subsetSequenceByFocus(sequence: PoseFrame[], focus: PoseFocus): PoseFrame[] {
  return sequence.map((frame) => subsetFrameByFocus(frame, focus));
}

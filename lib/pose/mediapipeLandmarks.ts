/**
 * Map MediaPipe / ThinkSys native landmark format to our PoseFrame.
 * Packages deliver { x, y, z?, visibility? } per landmark (33 for full body).
 */

import type { PoseFrame, PoseLandmark } from './types';

export interface MediaPipeLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/**
 * Convert native landmarks array to PoseFrame (PoseLandmark[]).
 * Works with @gymbrosinc (x,y,z,visibility) and @thinksys (same or similar).
 */
export function mediaPipeResultToFrame(landmarks: MediaPipeLandmark[]): PoseFrame {
  if (!Array.isArray(landmarks)) return [];
  return landmarks.map((m) => ({
    x: m.x,
    y: m.y,
    z: m.z,
    visibility: m.visibility,
  })) as PoseFrame;
}

/**
 * Normalize ThinkSys onLandmark(data) payload to PoseFrame.
 * Accepts array or object with landmarks array.
 */
export function thinksysLandmarksToFrame(data: unknown): PoseFrame {
  if (Array.isArray(data)) return mediaPipeResultToFrame(data as MediaPipeLandmark[]);
  if (data && typeof data === 'object' && Array.isArray((data as { landmarks?: unknown }).landmarks)) {
    return mediaPipeResultToFrame((data as { landmarks: MediaPipeLandmark[] }).landmarks);
  }
  return [];
}

/**
 * Map MediaPipe / ThinkSys native landmark format to our PoseFrame.
 * Packages deliver { x, y, z?, visibility? } per landmark (33 for full body).
 * Native bridges sometimes send different shapes (poseLandmarks, first person, etc.).
 */

import type { PoseFrame, PoseLandmark } from './types';

export interface MediaPipeLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

function hasXY(m: unknown): m is { x: number; y: number; z?: number; visibility?: number } {
  return m != null && typeof m === 'object' && typeof (m as { x?: unknown }).x === 'number' && typeof (m as { y?: unknown }).y === 'number';
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

/** Extract an array of {x,y} from various native payload shapes. */
function extractLandmarksArray(data: unknown): unknown[] | null {
  if (Array.isArray(data) && data.length > 0 && hasXY(data[0])) return data;
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.landmarks)) return o.landmarks as unknown[];
  const result = o.result && typeof o.result === 'object' ? (o.result as Record<string, unknown>) : null;
  if (result && Array.isArray(result.landmarks)) return result.landmarks as unknown[];
  if (Array.isArray(o.poseLandmarks)) {
    const pl = o.poseLandmarks as unknown[];
    if (pl.length === 0) return null;
    const first = pl[0];
    if (Array.isArray(first) && first.length > 0 && hasXY(first[0])) return first as unknown[];
    if (hasXY(first)) return pl;
    return null;
  }
  if (Array.isArray(o.pose_landmarks)) return (o.pose_landmarks as unknown[]).flat();
  const keys = Object.keys(o).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  if (keys.length > 0) {
    const arr = keys.map((k) => o[k]);
    if (arr.every(hasXY)) return arr;
  }
  return null;
}

/**
 * Normalize ThinkSys / MediaPipe onLandmark(data) payload to PoseFrame.
 * Tries: JSON string, array, data.landmarks, data.poseLandmarks, data.poseLandmarks[0], object with numeric keys.
 */
export function thinksysLandmarksToFrame(data: unknown): PoseFrame {
  let parsed: unknown = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return [];
    }
  }
  const arr = extractLandmarksArray(parsed);
  if (!arr || arr.length === 0) return [];
  // Preserve indices so MediaPipe 33 / MoveNet 17 landmark slots stay correct (arms at 11,12,13,14,15,16 etc).
  return arr.map((m) =>
    hasXY(m)
      ? {
          x: (m as { x: number }).x,
          y: (m as { y: number }).y,
          z: (m as { z?: number }).z,
          visibility: (m as { visibility?: number }).visibility,
        }
      : ({ x: NaN, y: NaN })
  ) as PoseFrame;
}
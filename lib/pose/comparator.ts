/**
 * Compare user pose sequence to reference: frame-by-frame mean distance.
 * Lower distance = better match. Use a threshold to decide correct vs wrong rep.
 */

import type { PoseFrame, PoseSequence } from './types';
import { normalizeFrame } from './normalizer';

/**
 * Mean L2 distance between two frames (same number of landmarks).
 * Ignores visibility; uses x,y and z if present.
 */
function frameDistance(a: PoseFrame, b: PoseFrame): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const pa = a[i]!;
    const pb = b[i]!;
    const dx = pa.x - pb.x;
    const dy = pa.y - pb.y;
    const dz = (pa.z ?? 0) - (pb.z ?? 0);
    sum += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return sum / n;
}

/**
 * Align lengths by linear interpolation: target length = refLen.
 * Returns new sequence of length refLen.
 */
function resampleToLength(sequence: PoseFrame[], refLen: number): PoseFrame[] {
  if (refLen <= 0 || sequence.length === 0) return [];
  if (sequence.length === refLen) return [...sequence];
  if (refLen === 1) return [sequence[0]!];
  const result: PoseFrame[] = [];
  const numLandmarks = sequence[0]!.length;
  for (let t = 0; t < refLen; t++) {
    const idx = (t / (refLen - 1)) * (sequence.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, sequence.length - 1);
    const frac = idx - i0;
    const frame: PoseFrame = [];
    for (let k = 0; k < numLandmarks; k++) {
      const p0 = sequence[i0]![k]!;
      const p1 = sequence[i1]![k]!;
      frame.push({
        x: p0.x + frac * (p1.x - p0.x),
        y: p0.y + frac * (p1.y - p0.y),
        z: p0.z != null && p1.z != null ? p0.z + frac * (p1.z - p0.z) : undefined,
        visibility: p0.visibility ?? p1.visibility,
      });
    }
    result.push(frame);
  }
  return result;
}

/**
 * Compare user rep sequence to reference rep sequence.
 * Both are normalized; reference length is canonical. Returns mean per-frame distance.
 */
export function compareReps(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  options?: { normalizeUser?: boolean }
): number {
  if (referenceFrames.length === 0 || userFrames.length === 0) return Infinity;
  const normalize = options?.normalizeUser !== false;
  const refNorm = referenceFrames.map(normalizeFrame);
  const userNorm = normalize
    ? resampleToLength(
        userFrames.map(normalizeFrame),
        refNorm.length
      )
    : resampleToLength(userFrames, refNorm.length);
  let sum = 0;
  const n = Math.min(refNorm.length, userNorm.length);
  for (let i = 0; i < n; i++) {
    sum += frameDistance(refNorm[i]!, userNorm[i]!);
  }
  return n > 0 ? sum / n : Infinity;
}

/** Default threshold: below this mean distance, rep is considered "correct". Tune per exercise. */
export const DEFAULT_MATCH_THRESHOLD = 0.15;

export function isRepMatch(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[],
  threshold: number = DEFAULT_MATCH_THRESHOLD
): boolean {
  const distance = compareReps(userFrames, referenceFrames);
  return distance < threshold;
}

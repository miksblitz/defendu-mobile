/**
 * Normalize pose landmarks for comparison: center on mid-hip, scale by body size.
 * MediaPipe landmarks are 0–1 normalized; we keep that and add translation/scale invariance.
 */

import type { PoseFrame, PoseLandmark } from './types';

/** Mid-hip index (MediaPipe 33-landmark: 23–24 are hips). */
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

function mid(a: PoseLandmark, b: PoseLandmark): PoseLandmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: a.z != null && b.z != null ? (a.z + b.z) / 2 : undefined,
    visibility: a.visibility != null && b.visibility != null ? (a.visibility + b.visibility) / 2 : undefined,
  };
}

function scale(p: PoseLandmark, s: number): PoseLandmark {
  return {
    x: p.x * s,
    y: p.y * s,
    z: p.z != null ? p.z * s : undefined,
    visibility: p.visibility,
  };
}

function sub(a: PoseLandmark, b: PoseLandmark): PoseLandmark {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z != null && b.z != null ? a.z - b.z : undefined,
    visibility: a.visibility,
  };
}

/** Body scale = shoulder-hip distance (avoid div by zero). */
function bodyScale(frame: PoseFrame): number {
  if (frame.length < Math.max(LEFT_SHOULDER, RIGHT_SHOULDER) + 1) return 1;
  const ls = frame[LEFT_SHOULDER];
  const rs = frame[RIGHT_SHOULDER];
  const lh = frame[LEFT_HIP];
  const rh = frame[RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return 1;
  const shoulderMid = mid(ls, rs);
  const hipMid = mid(lh, rh);
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  return 1 / d;
}

/**
 * Normalize a single frame: center on mid-hip, scale by body size.
 * Returns new array; tolerates missing landmarks (uses 0 for missing).
 */
export function normalizeFrame(frame: PoseFrame): PoseFrame {
  if (frame.length === 0) return [];
  const leftHip = frame[LEFT_HIP] ?? { x: 0.5, y: 0.5, z: 0, visibility: 0 };
  const rightHip = frame[RIGHT_HIP] ?? { x: 0.5, y: 0.5, z: 0, visibility: 0 };
  const center = mid(leftHip, rightHip);
  const s = bodyScale(frame);
  return frame.map((p) => scale(sub(p, center), s));
}

/**
 * Normalize a sequence of frames (e.g. one rep).
 */
export function normalizeSequence(sequence: PoseFrame[]): PoseFrame[] {
  return sequence.map(normalizeFrame);
}

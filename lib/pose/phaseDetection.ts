/**
 * Detect jab phases (guard, extension, impact, recoil) in a pose sequence.
 * Used to compare user motion phase-by-phase and to give targeted feedback.
 * MediaPipe 33-landmark: 11/12 shoulders, 15/16 wrists. MoveNet 17: 5/6 shoulders, 9/10 wrists.
 */

import type { PoseFrame, PoseSequence, JabPhase, PhaseBounds } from './types';

const MEDIAPIPE = { ls: 11, rs: 12, lw: 15, rw: 16 };
const MOVENET_17 = { ls: 5, rs: 6, lw: 9, rw: 10 };

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** Wrist-to-shoulder distance for left and right arm. Supports 33 (MediaPipe) or 17 (MoveNet) landmarks. Uses only arm landmarks. */
export function armExtensionDistances(frame: PoseFrame): { left: number; right: number } | null {
  const idx = frame.length >= 17 ? (frame.length <= 17 ? MOVENET_17 : MEDIAPIPE) : null;
  if (!idx || frame.length <= Math.max(idx.lw, idx.rw)) return null;
  const ls = frame[idx.ls];
  const rs = frame[idx.rs];
  const lw = frame[idx.lw];
  const rw = frame[idx.rw];
  if (!validPoint(ls) || !validPoint(rs) || !validPoint(lw) || !validPoint(rw)) return null;
  return {
    left: dist(lw!, ls!),
    right: dist(rw!, rs!),
  };
}

/** Which arm extends more over the sequence (0 = left, 1 = right). */
function detectPunchingArm(sequence: PoseFrame[]): 0 | 1 {
  let maxLeft = 0;
  let maxRight = 0;
  for (const frame of sequence) {
    const d = armExtensionDistances(frame);
    if (d) {
      maxLeft = Math.max(maxLeft, d.left);
      maxRight = Math.max(maxRight, d.right);
    }
  }
  return maxRight >= maxLeft ? 1 : 0;
}

/** Extension distance for the given arm (0 = left, 1 = right). */
function extensionForArm(frame: PoseFrame, arm: 0 | 1): number | null {
  const d = armExtensionDistances(frame);
  if (!d) return null;
  return arm === 0 ? d.left : d.right;
}

/** Smooth a series of values with a simple moving average (window 3). */
function smooth(values: number[], window = 3): number[] {
  if (values.length < window) return values;
  const out: number[] = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j]!;
      count++;
    }
    out.push(sum / count);
  }
  return out;
}

/**
 * Detect phase bounds in a jab sequence.
 * - guard: start until extension begins (arm starts moving out).
 * - extension: arm extending toward max.
 * - impact: short window around max extension.
 * - recoil: arm retracting back.
 */
export function detectJabPhases(sequence: PoseFrame[]): PhaseBounds[] {
  if (sequence.length < 5) return [];

  const arm = detectPunchingArm(sequence);
  const ext: number[] = [];
  for (const frame of sequence) {
    const e = extensionForArm(frame, arm);
    ext.push(e ?? 0);
  }
  const smoothed = smooth(ext, 3);

  const maxExt = Math.max(...smoothed);
  const minExt = Math.min(...smoothed);
  const range = maxExt - minExt;
  if (range < 0.02) return []; // no clear extension

  // Thresholds relative to range
  const extendStart = minExt + range * 0.15;
  const impactThreshold = minExt + range * 0.85;
  const recoilStart = maxExt - range * 0.2;

  let guardEnd = 0;
  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i]! > extendStart) {
      guardEnd = i;
      break;
    }
    guardEnd = i;
  }

  let impactStart = guardEnd;
  let impactEnd = guardEnd;
  for (let i = guardEnd; i < smoothed.length; i++) {
    if (smoothed[i]! >= impactThreshold) {
      impactStart = i;
      break;
    }
  }
  for (let i = impactStart; i < smoothed.length; i++) {
    if (smoothed[i]! < recoilStart) {
      impactEnd = i - 1;
      break;
    }
    impactEnd = i;
  }

  let recoilEnd = smoothed.length - 1;
  for (let i = impactEnd + 1; i < smoothed.length; i++) {
    if (smoothed[i]! <= extendStart) {
      recoilEnd = i;
      break;
    }
  }

  const extensionEnd = Math.max(guardEnd, impactStart - 1);
  const bounds: PhaseBounds[] = [];

  if (guardEnd >= 0) {
    bounds.push({ phase: 'guard', start: 0, end: guardEnd });
  }
  if (extensionEnd >= guardEnd) {
    bounds.push({ phase: 'extension', start: guardEnd + 1, end: extensionEnd });
  }
  if (impactEnd >= impactStart) {
    bounds.push({ phase: 'impact', start: impactStart, end: impactEnd });
  }
  if (recoilEnd > impactEnd) {
    bounds.push({ phase: 'recoil', start: impactEnd + 1, end: recoilEnd });
  }

  return bounds;
}

/**
 * Get a representative frame for a phase (e.g. middle of impact for "final form").
 */
export function getPhaseFrame(sequence: PoseSequence, phase: JabPhase, bounds: PhaseBounds[]): PoseFrame | null {
  const b = bounds.find((x) => x.phase === phase);
  if (!b || sequence.length === 0) return null;
  const start = Math.max(0, b.start);
  const end = Math.min(sequence.length - 1, b.end);
  const mid = Math.floor((start + end) / 2);
  return sequence[mid] ?? null;
}
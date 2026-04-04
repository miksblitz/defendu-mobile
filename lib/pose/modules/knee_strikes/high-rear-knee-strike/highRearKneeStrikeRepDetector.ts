/**
 * High rear knee strike — rep detector.
 *
 * Left leg only: if the left knee is visibly above the mid-hip horizontal line (MediaPipe
 * image Y — smaller Y is higher on screen), count a rep after a short hold.
 * No knee/ankle angle checks; ankle position is irrelevant for the trigger.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';

const COOLDOWN_MS = 650;
const MIN_REP_FRAMES = 3;

/** Knee must be at least this far above mid-hip (in Y) to count as "raised". */
const RAISE_ABOVE_HIP = 0.02;

const MP = {
  lh: 23,
  rh: 24,
  lk: 25,
  rk: 26,
};

const MN17 = {
  lh: 11,
  rh: 12,
  lk: 13,
  rk: 14,
};

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function getIdx(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > MP.rk) return MP;
  if (frame.length > MN17.rk) return MN17;
  return null;
}

function midHipY(frame: PoseFrame, idx: typeof MP | typeof MN17): number | null {
  const lh = frame[idx.lh];
  const rh = frame[idx.rh];
  if (!validPoint(lh) || !validPoint(rh)) return null;
  return (lh.y + rh.y) / 2;
}

function leftKneeAboveHipLine(frame: PoseFrame, idx: typeof MP | typeof MN17, margin: number): boolean {
  const line = midHipY(frame, idx);
  if (line == null) return false;
  const lk = frame[idx.lk];
  return validPoint(lk) && lk.y < line - margin;
}

export function createHighRearKneeStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'raised' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const idx = getIdx(frame);
    if (!idx) return { done: false };

    const raised = leftKneeAboveHipLine(frame, idx, RAISE_ABOVE_HIP);

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      if (raised) return { done: false };
      phase = 'idle';
      segment = [];
      return { done: false };
    }

    if (phase === 'idle') {
      if (!raised) return { done: false };
      phase = 'raised';
      segment = [frame];
      return { done: false };
    }

    if (!raised) {
      phase = 'idle';
      segment = [];
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

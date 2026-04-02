/**
 * Block rep detector: counts a rep when user transitions from neutral/normal stance
 * into a valid two-hand guard (blocking) and holds briefly.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 900;
const MIN_REP_FRAMES = 5;
const GUARD_MAX_EXTENSION = 0.24;
const GUARD_WRIST_UP_TOL = 0.12;
const RESET_MIN_EXTENSION = 0.2;

const MP = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const MN17 = { ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function getArmIndices(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > 17) return MP;
  if (frame.length >= 11) return MN17;
  return null;
}

function isBlockingFrame(frame: PoseFrame): boolean {
  const d = armExtensionDistances(frame);
  const idx = getArmIndices(frame);
  if (!d || !idx || frame.length <= Math.max(idx.rw, idx.re, idx.lw, idx.le)) return false;

  const le = frame[idx.le];
  const re = frame[idx.re];
  const lw = frame[idx.lw];
  const rw = frame[idx.rw];
  if (!validPoint(le) || !validPoint(re) || !validPoint(lw) || !validPoint(rw)) return false;

  const leftGuard = d.left <= GUARD_MAX_EXTENSION;
  const rightGuard = d.right <= GUARD_MAX_EXTENSION;
  const leftWristUp = lw.y <= le.y + GUARD_WRIST_UP_TOL;
  const rightWristUp = rw.y <= re.y + GUARD_WRIST_UP_TOL;
  return leftGuard && rightGuard && leftWristUp && rightWristUp;
}

function isNeutralFrame(frame: PoseFrame): boolean {
  const d = armExtensionDistances(frame);
  if (!d) return false;
  // Neutral/normal stance should show at least one arm more relaxed/open.
  return d.left >= RESET_MIN_EXTENSION || d.right >= RESET_MIN_EXTENSION;
}

export function createBlockRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'blocking' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasResetSinceRep = true;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      if (isNeutralFrame(frame)) hasResetSinceRep = true;
      if (now >= cooldownUntil && hasResetSinceRep) phase = 'idle';
      return { done: false };
    }

    const blocking = isBlockingFrame(frame);

    if (phase === 'idle') {
      if (isNeutralFrame(frame)) hasResetSinceRep = true;
      if (hasResetSinceRep && blocking) {
        phase = 'blocking';
        segment = [frame];
      }
      return { done: false };
    }

    if (phase === 'blocking') {
      if (!blocking) {
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
        hasResetSinceRep = false;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    return { done: false };
  };
}

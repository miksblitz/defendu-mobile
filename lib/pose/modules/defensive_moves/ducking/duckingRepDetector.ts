/**
 * Ducking rep detector:
 * - Detects standing (up) -> ducking (down) movement by upper-body vertical drop
 * - Does not rely on head landmarks
 * - Requires guard-up hands while ducking
 * - Adds cooldown before a new rep can be counted
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 900;
const GUARD_BAD_COOLDOWN_MS = 220;
const MIN_REP_FRAMES = 3;
const DUCK_DOWN_DELTA_Y = 0.04;
const RESET_UP_DELTA_Y = 0.02;
const MAX_GUARD_EXTENSION = 0.36;
const WRIST_UP_TOL = 0.1;

const MP = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const MN17 = { ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function getIdx(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > 17) return MP;
  if (frame.length >= 11) return MN17;
  return null;
}

function shoulderMidY(frame: PoseFrame): number | null {
  const idx = getIdx(frame);
  if (!idx || frame.length <= Math.max(idx.ls, idx.rs)) return null;
  const ls = frame[idx.ls];
  const rs = frame[idx.rs];
  if (!validPoint(ls) || !validPoint(rs)) return null;
  return (ls.y + rs.y) / 2;
}

function handsInGuard(frame: PoseFrame): boolean {
  const idx = getIdx(frame);
  const d = armExtensionDistances(frame);
  if (!idx || !d || frame.length <= Math.max(idx.rw, idx.re, idx.lw, idx.le)) return false;
  const le = frame[idx.le];
  const re = frame[idx.re];
  const lw = frame[idx.lw];
  const rw = frame[idx.rw];
  if (!validPoint(le) || !validPoint(re) || !validPoint(lw) || !validPoint(rw)) return false;
  const leftWristUp = lw.y <= le.y + WRIST_UP_TOL;
  const rightWristUp = rw.y <= re.y + WRIST_UP_TOL;
  const leftCompact = d.left <= MAX_GUARD_EXTENSION;
  const rightCompact = d.right <= MAX_GUARD_EXTENSION;
  return leftWristUp && rightWristUp && leftCompact && rightCompact;
}

export function createDuckingRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'ducking' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasResetSinceRep = true;
  let baselineShoulderY: number | null = null;
  let guardBadUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const y = shoulderMidY(frame);
    if (y == null) return { done: false };

    if (baselineShoulderY == null) baselineShoulderY = y;
    // Slow baseline adaptation while in neutral/up posture.
    if (phase === 'idle' && Math.abs(y - baselineShoulderY) < 0.04) {
      baselineShoulderY = baselineShoulderY * 0.92 + y * 0.08;
    }

    if (phase === 'cooldown') {
      if (baselineShoulderY != null && y <= baselineShoulderY + RESET_UP_DELTA_Y) hasResetSinceRep = true;
      if (now >= cooldownUntil && hasResetSinceRep) phase = 'idle';
      return { done: false };
    }

    const downEnough = baselineShoulderY != null && y >= baselineShoulderY + DUCK_DOWN_DELTA_Y;
    const upEnough = baselineShoulderY != null && y <= baselineShoulderY + RESET_UP_DELTA_Y;
    const guard = handsInGuard(frame);

    if (phase === 'idle') {
      if (upEnough) hasResetSinceRep = true;
      if (hasResetSinceRep && downEnough && !guard && now >= guardBadUntil) {
        guardBadUntil = now + GUARD_BAD_COOLDOWN_MS;
        return {
          done: true,
          segment: [frame],
          forcedBadRep: true,
          feedback: [{
            id: 'ducking-guard-bad-rep',
            message: 'KEEP HANDS UP',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }
      if (hasResetSinceRep && downEnough && guard) {
        phase = 'ducking';
        segment = [frame];
      }
      return { done: false };
    }

    // ducking phase
    if (!downEnough || !guard) {
      if (!guard && now >= guardBadUntil) {
        guardBadUntil = now + GUARD_BAD_COOLDOWN_MS;
        const badSeg = segment.length > 0 ? [...segment, frame] : [frame];
        phase = 'idle';
        segment = [];
        return {
          done: true,
          segment: badSeg,
          forcedBadRep: true,
          feedback: [{
            id: 'ducking-guard-bad-rep',
            message: 'KEEP HANDS UP',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }
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
  };
}

/**
 * Parry rep detector:
 * - Either left or right arm can be the active parry arm.
 * - Requires a neutral reset before each rep.
 * - Includes cooldown after a completed perfect rep.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 900;
const MIN_REP_FRAMES = 4;
const NEUTRAL_MAX_EXTENSION = 0.23;
const PARRY_MIN_EXTENSION = 0.26;
const PARRY_MIN_LATERAL = 0.1;
const WRIST_ABOVE_SHOULDER_MIN = 0.04;

const MP = { ls: 11, rs: 12, lw: 15, rw: 16 };
const MN17 = { ls: 5, rs: 6, lw: 9, rw: 10 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function getIdx(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > 17) return MP;
  if (frame.length >= 11) return MN17;
  return null;
}

function isParryArm(frame: PoseFrame, side: 'left' | 'right'): boolean {
  const d = armExtensionDistances(frame);
  const idx = getIdx(frame);
  if (!d || !idx || frame.length <= Math.max(idx.rw, idx.rs)) return false;

  const shoulder = side === 'left' ? frame[idx.ls] : frame[idx.rs];
  const wrist = side === 'left' ? frame[idx.lw] : frame[idx.rw];
  const ext = side === 'left' ? d.left : d.right;
  if (!validPoint(shoulder) || !validPoint(wrist)) return false;

  const lateral = Math.abs(wrist.x - shoulder.x);
  const wristAbove = shoulder.y - wrist.y;
  return ext >= PARRY_MIN_EXTENSION && lateral >= PARRY_MIN_LATERAL && wristAbove >= WRIST_ABOVE_SHOULDER_MIN;
}

function detectParrySide(frame: PoseFrame): 'left' | 'right' | null {
  const left = isParryArm(frame, 'left');
  const right = isParryArm(frame, 'right');
  if (left && right) return 'right';
  if (left) return 'left';
  if (right) return 'right';
  return null;
}

function isNeutral(frame: PoseFrame): boolean {
  const d = armExtensionDistances(frame);
  if (!d) return false;
  return d.left <= NEUTRAL_MAX_EXTENSION && d.right <= NEUTRAL_MAX_EXTENSION;
}

export function createParryRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'parrying' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasNeutralSinceRep = true;
  let activeSide: 'left' | 'right' | null = null;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      if (isNeutral(frame)) hasNeutralSinceRep = true;
      if (now >= cooldownUntil && hasNeutralSinceRep) phase = 'idle';
      return { done: false };
    }

    const side = detectParrySide(frame);

    if (phase === 'idle') {
      if (isNeutral(frame)) hasNeutralSinceRep = true;
      if (hasNeutralSinceRep && side != null) {
        phase = 'parrying';
        activeSide = side;
        segment = [frame];
      }
      return { done: false };
    }

    if (side == null || side !== activeSide) {
      phase = 'idle';
      activeSide = null;
      segment = [];
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      activeSide = null;
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      hasNeutralSinceRep = false;
      return { done: true, segment: out };
    }
    return { done: false };
  };
}

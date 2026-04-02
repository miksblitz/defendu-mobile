/**
 * Slip rep detector:
 * - Start from neutral centerline
 * - Upper body slips left OR right away from centerline
 * - Hips/core remain relatively stable (base for balance)
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';

const COOLDOWN_MS = 800;
const MIN_REP_FRAMES = 4;
const NEUTRAL_OFFSET_MAX = 0.04;
const SLIP_OFFSET_MIN = 0.075;
const MAX_HIP_DRIFT = 0.04;

const MP = { ls: 11, rs: 12, lh: 23, rh: 24 };
const MN17 = { ls: 5, rs: 6, lh: 11, rh: 12 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function idx(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > 24) return MP;
  if (frame.length >= 13) return MN17;
  return null;
}

type SlipMetrics = {
  torsoX: number;
  hipX: number;
  offset: number;
  absOffset: number;
};

function getSlipMetrics(frame: PoseFrame): SlipMetrics | null {
  const i = idx(frame);
  if (!i || frame.length <= Math.max(i.rs, i.rh)) return null;
  const ls = frame[i.ls];
  const rs = frame[i.rs];
  const lh = frame[i.lh];
  const rh = frame[i.rh];
  if (!validPoint(ls) || !validPoint(rs) || !validPoint(lh) || !validPoint(rh)) return null;
  const torsoX = (ls.x + rs.x) / 2;
  const hipX = (lh.x + rh.x) / 2;
  const offset = torsoX - hipX;
  return { torsoX, hipX, offset, absOffset: Math.abs(offset) };
}

function isNeutral(frame: PoseFrame): boolean {
  const m = getSlipMetrics(frame);
  return !!m && m.absOffset <= NEUTRAL_OFFSET_MAX;
}

export function createSlipRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'slipping' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasNeutralSinceRep = true;
  let baseHipX: number | null = null;
  let direction: -1 | 1 | null = null;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const m = getSlipMetrics(frame);
    if (!m) return { done: false };

    if (phase === 'cooldown') {
      if (isNeutral(frame)) hasNeutralSinceRep = true;
      if (now >= cooldownUntil && hasNeutralSinceRep) phase = 'idle';
      return { done: false };
    }

    if (phase === 'idle') {
      if (isNeutral(frame)) hasNeutralSinceRep = true;
      if (hasNeutralSinceRep && m.absOffset >= SLIP_OFFSET_MIN) {
        phase = 'slipping';
        segment = [frame];
        baseHipX = m.hipX;
        direction = m.offset >= 0 ? 1 : -1;
      }
      return { done: false };
    }

    // slipping phase
    segment.push(frame);
    const sameDirection = direction != null && (direction === 1 ? m.offset > 0 : m.offset < 0);
    const hipStable = baseHipX != null ? Math.abs(m.hipX - baseHipX) <= MAX_HIP_DRIFT : false;
    const slippedEnough = m.absOffset >= SLIP_OFFSET_MIN;

    if (!sameDirection || !hipStable || !slippedEnough) {
      phase = 'idle';
      segment = [];
      baseHipX = null;
      direction = null;
      return { done: false };
    }

    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      hasNeutralSinceRep = false;
      baseHipX = null;
      direction = null;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

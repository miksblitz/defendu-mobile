/**
 * Slip rep detector:
 * - Start from neutral centerline
 * - Upper body slips left OR right away from centerline
 * - Hips/core remain relatively stable (base for balance)
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 450;
const MIN_REP_FRAMES = 3;
const NEUTRAL_OFFSET_MAX = 0.04;
const SLIP_OFFSET_MIN = 0.06;
const MAX_HIP_DRIFT = 0.04;
const MAX_GUARD_EXTENSION = 0.36;
const WRIST_UP_TOL = 0.1;

export type SlipDirection = 'left' | 'right' | 'either';

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

function handsInGuard(frame: PoseFrame): boolean {
  const i = idx(frame);
  const d = armExtensionDistances(frame);
  if (!i || !d) return false;
  const leftElbowIdx = i === MP ? 13 : 7;
  const rightElbowIdx = i === MP ? 14 : 8;
  const leftWristIdx = i === MP ? 15 : 9;
  const rightWristIdx = i === MP ? 16 : 10;
  if (frame.length <= Math.max(rightWristIdx, rightElbowIdx, leftWristIdx, leftElbowIdx)) return false;
  const le = frame[leftElbowIdx];
  const re = frame[rightElbowIdx];
  const lw = frame[leftWristIdx];
  const rw = frame[rightWristIdx];
  if (!validPoint(le) || !validPoint(re) || !validPoint(lw) || !validPoint(rw)) return false;
  const leftWristUp = lw.y <= le.y + WRIST_UP_TOL;
  const rightWristUp = rw.y <= re.y + WRIST_UP_TOL;
  const leftCompact = d.left <= MAX_GUARD_EXTENSION;
  const rightCompact = d.right <= MAX_GUARD_EXTENSION;
  return leftWristUp && rightWristUp && leftCompact && rightCompact;
}

function isNeutral(frame: PoseFrame): boolean {
  const m = getSlipMetrics(frame);
  return !!m && m.absOffset <= NEUTRAL_OFFSET_MAX;
}

export function createSlipRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  return createSlipRepDetectorForDirection('either');
}

function matchesExpectedDirection(offset: number, direction: SlipDirection): boolean {
  if (direction === 'either') return true;
  if (direction === 'left') return offset < 0;
  return offset > 0;
}

export function createSlipRepDetectorForDirection(
  expectedDirection: SlipDirection
): (frame: PoseFrame, now: number) => RepDetectorResult {
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
      if (hasNeutralSinceRep && m.absOffset >= SLIP_OFFSET_MIN && matchesExpectedDirection(m.offset, expectedDirection)) {
        if (!handsInGuard(frame)) {
          return {
            done: true,
            segment: [frame],
            forcedBadRep: true,
            feedback: [{
              id: 'guard-not-up-while-slipping',
              message: 'KEEP BOTH HANDS UP!',
              severity: 'error',
              phase: 'impact',
            }],
          };
        }
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
    const guard = handsInGuard(frame);

    if (!sameDirection || !hipStable || !slippedEnough || !guard) {
      const badSegment = [...segment];
      phase = 'idle';
      segment = [];
      baseHipX = null;
      direction = null;
      if (badSegment.length > 0) {
        const isGuardIssue = !guard;
        return {
          done: true,
          segment: badSegment,
          forcedBadRep: true,
          feedback: [{
            id: isGuardIssue ? 'guard-not-up-while-slipping' : 'bad-rep-slip',
            message: isGuardIssue
              ? 'KEEP BOTH HANDS UP!'
              : 'Bad Repetition — complete a clean slip to one side and keep hips stable. Try again.',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }
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

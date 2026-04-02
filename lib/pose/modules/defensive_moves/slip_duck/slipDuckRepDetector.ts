/**
 * Slip + duck rep detector:
 * 1) Slip off centerline (torso vs hips) with stable hips.
 * 2) Duck: shoulder line drops while hands stay in guard.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 900;
const MIN_SLIP_FRAMES = 3;
const MIN_DUCK_FRAMES = 4;
const NEUTRAL_OFFSET_MAX = 0.04;
const SLIP_OFFSET_MIN = 0.075;
const SLIP_MAINTAIN_MIN = 0.048;
const MAX_HIP_DRIFT = 0.04;
const MAX_HIP_DRIFT_DUCK = 0.065;
/** Drop in image Y (down = larger y) vs slip-end level; tuned with SlipandDuck_MiksAboyme_pose_data.csv */
const DUCK_DOWN_DELTA_Y = 0.042;
const MAX_GUARD_EXTENSION = 0.3;
const WRIST_UP_TOL = 0.06;
/** Duck often has wider arms / deeper tuck — still “hands up” but looser than strict guard. */
const DUCK_MAX_GUARD_EXTENSION = 0.38;
const DUCK_WRIST_UP_TOL = 0.09;

const MP = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24 };
const MN17 = { nose: 0, ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10, lh: 11, rh: 12 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function bodyIdx(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > 24) return MP;
  if (frame.length >= 13) return MN17;
  return null;
}

type SlipMetrics = { offset: number; absOffset: number; hipX: number };

function getSlipMetrics(frame: PoseFrame): SlipMetrics | null {
  const i = bodyIdx(frame);
  if (!i || frame.length <= Math.max(i.rs, i.rh)) return null;
  const ls = frame[i.ls];
  const rs = frame[i.rs];
  const lh = frame[i.lh];
  const rh = frame[i.rh];
  if (!validPoint(ls) || !validPoint(rs) || !validPoint(lh) || !validPoint(rh)) return null;
  const torsoX = (ls.x + rs.x) / 2;
  const hipX = (lh.x + rh.x) / 2;
  const offset = torsoX - hipX;
  return { offset, absOffset: Math.abs(offset), hipX };
}

function isNeutralSlip(m: SlipMetrics): boolean {
  return m.absOffset <= NEUTRAL_OFFSET_MAX;
}

function shoulderMidY(frame: PoseFrame): number | null {
  const i = bodyIdx(frame);
  if (!i || frame.length <= Math.max(i.ls, i.rs)) return null;
  const ls = frame[i.ls];
  const rs = frame[i.rs];
  if (!validPoint(ls) || !validPoint(rs)) return null;
  return (ls.y + rs.y) / 2;
}

/**
 * Upper-body “level” for ducking: head and shoulders can move down together (knees/bend may shift hips).
 * Uses max(nose, shoulder mid) so head drop alone still counts as level change.
 */
function bodyLevelY(frame: PoseFrame): number | null {
  const i = bodyIdx(frame);
  const sy = shoulderMidY(frame);
  if (sy == null || !i || frame.length <= i.nose) return sy;
  const nose = frame[i.nose];
  if (!validPoint(nose)) return sy;
  return Math.max(sy, nose.y);
}

function handsInGuard(frame: PoseFrame, relaxed = false): boolean {
  const i = bodyIdx(frame);
  const d = armExtensionDistances(frame);
  if (!i || !d || frame.length <= Math.max(i.rw, i.re)) return false;
  const le = frame[i.le];
  const re = frame[i.re];
  const lw = frame[i.lw];
  const rw = frame[i.rw];
  if (!validPoint(le) || !validPoint(re) || !validPoint(lw) || !validPoint(rw)) return false;
  const maxExt = relaxed ? DUCK_MAX_GUARD_EXTENSION : MAX_GUARD_EXTENSION;
  const wristTol = relaxed ? DUCK_WRIST_UP_TOL : WRIST_UP_TOL;
  return (
    lw.y <= le.y + wristTol &&
    rw.y <= re.y + wristTol &&
    d.left <= maxExt &&
    d.right <= maxExt
  );
}

export function createSlipDuckRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'slipping' | 'ducking' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasNeutralSinceRep = true;
  let slipFrames = 0;
  let duckFrames = 0;
  let slipSign: -1 | 1 | null = null;
  let baseHipX: number | null = null;
  let duckRefY: number | null = null;

  function resetToIdle() {
    phase = 'idle';
    segment = [];
    slipFrames = 0;
    duckFrames = 0;
    slipSign = null;
    baseHipX = null;
    duckRefY = null;
  }

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const m = getSlipMetrics(frame);
    const levelY = bodyLevelY(frame);
    if (!m || levelY == null) return { done: false };

    if (phase === 'cooldown') {
      if (isNeutralSlip(m)) hasNeutralSinceRep = true;
      if (now >= cooldownUntil && hasNeutralSinceRep) phase = 'idle';
      return { done: false };
    }

    if (phase === 'idle') {
      if (isNeutralSlip(m)) hasNeutralSinceRep = true;
      if (hasNeutralSinceRep && m.absOffset >= SLIP_OFFSET_MIN) {
        phase = 'slipping';
        segment = [frame];
        baseHipX = m.hipX;
        slipSign = m.offset >= 0 ? 1 : -1;
        slipFrames = 1;
      }
      return { done: false };
    }

    if (phase === 'slipping') {
      segment.push(frame);
      const sameDirection = slipSign != null && (slipSign === 1 ? m.offset > 0 : m.offset < 0);
      const hipStable = baseHipX != null && Math.abs(m.hipX - baseHipX) <= MAX_HIP_DRIFT;
      const slippedEnough = m.absOffset >= SLIP_OFFSET_MIN;
      if (!sameDirection || !hipStable || !slippedEnough) {
        resetToIdle();
        return { done: false };
      }
      slipFrames++;
      if (slipFrames >= MIN_SLIP_FRAMES) {
        phase = 'ducking';
        duckRefY = levelY;
        duckFrames = 0;
      }
      return { done: false };
    }

    // ducking: stay slipped + relaxed guard + upper-body level drops (head and/or shoulders)
    segment.push(frame);
    const hipOk = baseHipX != null && Math.abs(m.hipX - baseHipX) <= MAX_HIP_DRIFT_DUCK;
    const slipHeld = m.absOffset >= SLIP_MAINTAIN_MIN;
    const sameDirection = slipSign != null && (slipSign === 1 ? m.offset > 0 : m.offset < 0);
    const guard = handsInGuard(frame, true);
    const downEnough = duckRefY != null && levelY >= duckRefY + DUCK_DOWN_DELTA_Y;

    if (!hipOk || !slipHeld || !sameDirection || !guard || !downEnough) {
      resetToIdle();
      return { done: false };
    }

    duckFrames++;
    if (duckFrames >= MIN_DUCK_FRAMES && segment.length >= MIN_SLIP_FRAMES + MIN_DUCK_FRAMES) {
      const out = [...segment];
      segment = [];
      slipFrames = 0;
      duckFrames = 0;
      slipSign = null;
      baseHipX = null;
      duckRefY = null;
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      hasNeutralSinceRep = false;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

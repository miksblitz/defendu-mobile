/**
 * Slip + parry rep detector (module formerly "roll"):
 * 1) Slip off the centerline (torso vs hips, stable hips — same idea as slip module).
 * 2) Parry with the opposite side arm: slip left → right parry; slip right → left parry.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 800;
const MIN_SLIP_FRAMES = 3;
const MIN_PARRY_FRAMES = 2;
const NEUTRAL_OFFSET_MAX = 0.04;
const SLIP_OFFSET_MIN = 0.075;
/** While parrying, allow slight return toward center. */
const SLIP_MAINTAIN_MIN = 0.048;
const MAX_HIP_DRIFT = 0.04;
const MAX_HIP_DRIFT_PARRY = 0.065;

/** Hand moves toward camera relative to same-side shoulder (MediaPipe z). */
const FORWARD_PARRY_MIN_Z = 0.03;
/** Fallback when z is unavailable (e.g. some MoveNet outputs). */
const SIMPLE_HAND_EXTENSION_MIN = 0.16;

const MP = { ls: 11, rs: 12, lw: 15, rw: 16, lh: 23, rh: 24 };
const MN17 = { ls: 5, rs: 6, lw: 9, rw: 10, lh: 11, rh: 12 };

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

function isSlipNeutral(m: SlipMetrics): boolean {
  return m.absOffset <= NEUTRAL_OFFSET_MAX;
}

function armExtension(frame: PoseFrame, side: 'left' | 'right'): number | null {
  const d = armExtensionDistances(frame);
  if (!d) return null;
  return side === 'left' ? d.left : d.right;
}

function forwardDepth(frame: PoseFrame, side: 'left' | 'right'): number | null {
  const i = bodyIdx(frame);
  if (!i || frame.length <= Math.max(i.rw, i.rs)) return null;
  const shoulder = side === 'left' ? frame[i.ls] : frame[i.rs];
  const wrist = side === 'left' ? frame[i.lw] : frame[i.rw];
  if (!shoulder || !wrist || !Number.isFinite(shoulder.z) || !Number.isFinite(wrist.z)) return null;
  // In MediaPipe, smaller z is closer to camera, so shoulder.z - wrist.z > 0 means forward hand.
  return shoulder.z! - wrist.z!;
}

function isTowardCameraParry(frame: PoseFrame, side: 'left' | 'right'): boolean {
  const dz = forwardDepth(frame, side);
  if (dz != null) return dz >= FORWARD_PARRY_MIN_Z;
  const ext = armExtension(frame, side);
  return ext != null && ext >= SIMPLE_HAND_EXTENSION_MIN;
}

/** Opposite-side parry: slip to the right (+offset) → lead / left parry. */
function requiredParrySideForSlip(slipSign: -1 | 1): 'left' | 'right' {
  return slipSign > 0 ? 'left' : 'right';
}

export function createSlipParryRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'slipping' | 'parrying' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasNeutralSinceRep = true;
  let slipFrames = 0;
  let parryFrames = 0;
  let slipSign: -1 | 1 | null = null;
  let baseHipX: number | null = null;
  let requiredParrySide: 'left' | 'right' | null = null;

  function resetToIdle() {
    phase = 'idle';
    segment = [];
    slipFrames = 0;
    parryFrames = 0;
    slipSign = null;
    baseHipX = null;
    requiredParrySide = null;
  }

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const m = getSlipMetrics(frame);
    if (!m) return { done: false };

    if (phase === 'cooldown') {
      if (isSlipNeutral(m)) hasNeutralSinceRep = true;
      if (now >= cooldownUntil && hasNeutralSinceRep) {
        phase = 'idle';
      }
      return { done: false };
    }

    if (phase === 'idle') {
      if (isSlipNeutral(m)) hasNeutralSinceRep = true;
      if (hasNeutralSinceRep && m.absOffset >= SLIP_OFFSET_MIN) {
        phase = 'slipping';
        segment = [frame];
        baseHipX = m.hipX;
        slipSign = m.offset >= 0 ? 1 : -1;
        requiredParrySide = requiredParrySideForSlip(slipSign);
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
        phase = 'parrying';
        parryFrames = 0;
          }
      return { done: false };
    }

    // parrying — opposite arm only
    segment.push(frame);
    const hipOk = baseHipX != null && Math.abs(m.hipX - baseHipX) <= MAX_HIP_DRIFT_PARRY;
    const slipHeld = m.absOffset >= SLIP_MAINTAIN_MIN;
    const sameDirection = slipSign != null && (slipSign === 1 ? m.offset > 0 : m.offset < 0);
    if (!hipOk || !slipHeld || !sameDirection || requiredParrySide == null) {
      resetToIdle();
      return { done: false };
    }

    const req = requiredParrySide;
    const wrong: 'left' | 'right' = req === 'left' ? 'right' : 'left';
    const reqDepth = forwardDepth(frame, req);
    const wrongDepth = forwardDepth(frame, wrong);
    const reqParry = isTowardCameraParry(frame, req);
    const wrongParry = isTowardCameraParry(frame, wrong);

    // Only the wrong arm reached forward, or it is clearly more forward than the required arm.
    const wrongDominates =
      wrongDepth != null && reqDepth != null
        ? wrongDepth > reqDepth + 0.012
        : false;
    if (wrongParry && (!reqParry || wrongDominates)) {
      resetToIdle();
      return { done: false };
    }

    if (reqParry) {
      parryFrames++;
      if (parryFrames >= MIN_PARRY_FRAMES && segment.length >= MIN_SLIP_FRAMES + MIN_PARRY_FRAMES) {
        const out = [...segment];
        segment = [];
        slipFrames = 0;
        parryFrames = 0;
        slipSign = null;
        baseHipX = null;
        requiredParrySide = null;
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasNeutralSinceRep = false;
        return { done: true, segment: out };
      }
    } else {
      parryFrames = 0;
    }

    return { done: false };
  };
}

/** @deprecated Use createSlipParryRepDetector; same behavior. */
export function createRollRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  return createSlipParryRepDetector();
}

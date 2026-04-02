/**
 * Slip + duck form feedback (slip off centerline, then duck with guard).
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const SLIP_OFFSET_MIN = 0.075;
const MAX_HIP_DRIFT = 0.055;
/** Aligned with slipDuckRepDetector (SlipandDuck CSV tuning). */
const DUCK_MIN_DELTA_Y = 0.042;
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

type SlipM = { offset: number; absOffset: number; hipX: number };

function slipMetrics(frame: PoseFrame): SlipM | null {
  const i = bodyIdx(frame);
  if (!i || frame.length <= Math.max(i.rs, i.rh)) return null;
  const ls = frame[i.ls], rs = frame[i.rs], lh = frame[i.lh], rh = frame[i.rh];
  if (!validPoint(ls) || !validPoint(rs) || !validPoint(lh) || !validPoint(rh)) return null;
  const torsoX = (ls.x + rs.x) / 2;
  const hipX = (lh.x + rh.x) / 2;
  const offset = torsoX - hipX;
  return { offset, absOffset: Math.abs(offset), hipX };
}

function shoulderMidY(frame: PoseFrame): number | null {
  const i = bodyIdx(frame);
  if (!i || frame.length <= Math.max(i.ls, i.rs)) return null;
  const ls = frame[i.ls], rs = frame[i.rs];
  if (!validPoint(ls) || !validPoint(rs)) return null;
  return (ls.y + rs.y) / 2;
}

function bodyLevelY(frame: PoseFrame): number | null {
  const i = bodyIdx(frame);
  const sy = shoulderMidY(frame);
  if (sy == null || !i || frame.length <= i.nose) return sy;
  const nose = frame[i.nose];
  if (!validPoint(nose)) return sy;
  return Math.max(sy, nose.y);
}

function guardOkDuck(frame: PoseFrame): boolean {
  const i = bodyIdx(frame);
  const d = armExtensionDistances(frame);
  if (!i || !d || frame.length <= Math.max(i.rw, i.re)) return false;
  const le = frame[i.le], re = frame[i.re], lw = frame[i.lw], rw = frame[i.rw];
  if (!validPoint(le) || !validPoint(re) || !validPoint(lw) || !validPoint(rw)) return false;
  return (
    lw.y <= le.y + DUCK_WRIST_UP_TOL &&
    rw.y <= re.y + DUCK_WRIST_UP_TOL &&
    d.left <= DUCK_MAX_GUARD_EXTENSION &&
    d.right <= DUCK_MAX_GUARD_EXTENSION
  );
}

export function getSlipDuckFeedback(userFrames: PoseFrame[], _referenceFrames: PoseFrame[] | null): PoseFeedbackItem[] {
  if (userFrames.length < 6) return [];
  const n = userFrames.length;
  const slipEnd = Math.max(1, Math.floor(n * 0.42));
  const duckIdx = Math.min(n - 1, Math.floor(n * 0.8));

  let hip0: number | null = null;
  let maxAbs = 0;
  for (let k = 0; k < slipEnd; k++) {
    const m = slipMetrics(userFrames[k]!);
    if (!m) continue;
    if (hip0 == null) hip0 = m.hipX;
    if (m.absOffset > maxAbs) maxAbs = m.absOffset;
  }

  const out: PoseFeedbackItem[] = [];

  const first = slipMetrics(userFrames[0]!);
  const slipLast = slipMetrics(userFrames[slipEnd - 1]!);
  if (
    first &&
    slipLast &&
    hip0 != null &&
    Math.abs(slipLast.hipX - hip0) > MAX_HIP_DRIFT
  ) {
    out.push({
      id: 'slip-duck-hip-drift',
      message: 'Keep hips quiet on the slip — upper body moves, base stays',
      phase: 'impact',
      severity: 'warning',
    });
  }

  if (maxAbs < SLIP_OFFSET_MIN) {
    out.push({
      id: 'slip-duck-no-slip',
      message: 'Slip off the centerline before you duck',
      phase: 'impact',
      severity: 'error',
    });
    return out;
  }

  const yStart = bodyLevelY(userFrames[slipEnd - 1]!);
  let yDuckMax = -Infinity;
  for (let k = slipEnd; k < n; k++) {
    const ly = bodyLevelY(userFrames[k]!);
    if (ly != null) yDuckMax = Math.max(yDuckMax, ly);
  }
  const yDuck = yDuckMax === -Infinity ? null : yDuckMax;
  if (yStart == null || yDuck == null) return out;

  if (yDuck - yStart < DUCK_MIN_DELTA_Y) {
    out.push({
      id: 'slip-duck-not-low-enough',
      message:
        'After the slip, drop your level (head/shoulders — bend knees or sink the torso, guard still up)',
      phase: 'impact',
      severity: 'error',
    });
  }

  const downFrame = userFrames[duckIdx]!;
  if (!guardOkDuck(downFrame)) {
    out.push({
      id: 'slip-duck-guard',
      message: 'Keep hands up in guard while you duck (elbows can be a bit wider)',
      phase: 'impact',
      severity: 'error',
    });
  }

  return out;
}

export function isSlipDuckFormAcceptable(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getSlipDuckFeedback(userFrames, referenceFrames);
  return { acceptable: feedback.filter((f) => f.severity === 'error').length === 0, feedback };
}

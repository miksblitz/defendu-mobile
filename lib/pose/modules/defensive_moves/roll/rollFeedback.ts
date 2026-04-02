/**
 * Slip + opposite-hand parry feedback (module id …72612042).
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const SLIP_OFFSET_MIN = 0.075;
const MAX_HIP_DRIFT = 0.055;
/** Preferred cue: hand goes forward toward camera (z). */
const FORWARD_PARRY_MIN_Z = 0.03;
/** Fallback when z is unavailable. */
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
  return shoulder.z! - wrist.z!;
}

function isTowardCameraParry(frame: PoseFrame, side: 'left' | 'right'): boolean {
  const dz = forwardDepth(frame, side);
  if (dz != null) return dz >= FORWARD_PARRY_MIN_Z;
  const ext = armExtension(frame, side);
  return ext != null && ext >= SIMPLE_HAND_EXTENSION_MIN;
}

function requiredParryForSlipSign(sign: number): 'left' | 'right' {
  return sign > 0 ? 'left' : 'right';
}

export function getRollFeedback(userFrames: PoseFrame[], _referenceFrames: PoseFrame[] | null): PoseFeedbackItem[] {
  if (userFrames.length < 6) return [];
  const n = userFrames.length;
  const earlyEnd = Math.max(1, Math.floor(n * 0.45));
  const lateStart = Math.min(n - 1, Math.floor(n * 0.55));

  let hip0: number | null = null;
  let maxAbs = 0;
  let slipSign = 0;
  for (let k = 0; k < earlyEnd; k++) {
    const m = slipMetrics(userFrames[k]!);
    if (!m) continue;
    if (hip0 == null) hip0 = m.hipX;
    if (m.absOffset > maxAbs) {
      maxAbs = m.absOffset;
      slipSign = Math.sign(m.offset);
    }
  }

  const out: PoseFeedbackItem[] = [];

  const first = slipMetrics(userFrames[0]!);
  const earlyLast = slipMetrics(userFrames[earlyEnd - 1]!);
  if (
    first &&
    earlyLast &&
    hip0 != null &&
    Math.abs(earlyLast.hipX - hip0) > MAX_HIP_DRIFT
  ) {
    out.push({
      id: 'slip-parry-hip-drift',
      message: 'Keep your base quiet — let the upper body slip, not the whole stance',
      phase: 'impact',
      severity: 'warning',
    });
  }

  if (maxAbs < SLIP_OFFSET_MIN || slipSign === 0) {
    out.push({
      id: 'slip-parry-no-slip',
      message: 'Slip off the centerline first, hips stay under you',
      phase: 'impact',
      severity: 'error',
    });
    return out;
  }

  const needParry = requiredParryForSlipSign(slipSign);
  const wrong: 'left' | 'right' = needParry === 'left' ? 'right' : 'left';

  let sawCorrect = false;
  let sawWrongOnly = false;
  for (let k = lateStart; k < n; k++) {
    const f = userFrames[k]!;
    const reqE = armExtension(f, needParry);
    const wrongE = armExtension(f, wrong);
    const reqDepth = forwardDepth(f, needParry);
    const wrongDepth = forwardDepth(f, wrong);
    const ok = isTowardCameraParry(f, needParry);
    const bad = isTowardCameraParry(f, wrong);
    if (ok) sawCorrect = true;
    if (
      bad &&
      (
        reqE == null ||
        reqE < SIMPLE_HAND_EXTENSION_MIN ||
        (wrongDepth != null && reqDepth != null ? wrongDepth > reqDepth + 0.012 : wrongE! > reqE + 0.02)
      )
    ) {
      sawWrongOnly = true;
    }
  }

  if (sawWrongOnly && !sawCorrect) {
    out.push({
      id: 'slip-parry-wrong-arm',
      message:
        slipSign < 0
          ? 'You slipped left — parry with your right hand'
          : 'You slipped right — parry with your left hand',
      phase: 'impact',
      severity: 'error',
    });
  } else if (!sawCorrect) {
    out.push({
      id: 'slip-parry-no-parry',
      message: 'After the slip, extend the opposite hand forward toward the camera',
      phase: 'impact',
      severity: 'error',
    });
  }

  return out;
}

export function isRollFormAcceptable(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getRollFeedback(userFrames, referenceFrames);
  return { acceptable: feedback.filter((f) => f.severity === 'error').length === 0, feedback };
}

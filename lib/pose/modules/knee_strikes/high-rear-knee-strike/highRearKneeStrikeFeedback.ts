/**
 * High rear knee strike — form checks aligned with the rep detector (left knee only).
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';

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

export function getHighRearKneeStrikeFormFeedback(
  userFrames: PoseFrame[]
): { passed: boolean; feedback: PoseFeedbackItem[] } {
  const idx = userFrames.length > 0 ? getIdx(userFrames[0]!) : null;
  if (!idx) {
    return {
      passed: false,
      feedback: [{ id: 'knee-landmarks', message: 'Hip/knee landmarks not detected clearly enough', severity: 'hint' }],
    };
  }

  let sawRaise = false;
  for (const f of userFrames) {
    const line = midHipY(f, idx);
    if (line == null) continue;
    const lk = f[idx.lk];
    const leftUp = validPoint(lk) && lk.y < line - RAISE_ABOVE_HIP;
    if (leftUp) {
      sawRaise = true;
      break;
    }
  }

  if (!sawRaise) {
    return {
      passed: false,
      feedback: [
        {
          id: 'knee-above-hip',
          message: 'Lift your left knee above your hip line (any knee/ankle angle is fine)',
          severity: 'hint',
        },
      ],
    };
  }

  return { passed: true, feedback: [] };
}

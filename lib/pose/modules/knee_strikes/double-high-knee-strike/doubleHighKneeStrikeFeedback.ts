/**
 * Double high knee strike — form checks for sequence order:
 * right knee up first, then left knee up.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';

const RAISE_ABOVE_HIP = 0.02;

const MP = { lh: 23, rh: 24, lk: 25, rk: 26 };
const MN17 = { lh: 11, rh: 12, lk: 13, rk: 14 };

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

function rightKneeUp(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const line = midHipY(frame, idx);
  const rk = frame[idx.rk];
  return line != null && validPoint(rk) && rk.y < line - RAISE_ABOVE_HIP;
}

function leftKneeUp(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  const line = midHipY(frame, idx);
  const lk = frame[idx.lk];
  return line != null && validPoint(lk) && lk.y < line - RAISE_ABOVE_HIP;
}

export function getDoubleHighKneeStrikeFormFeedback(
  userFrames: PoseFrame[]
): { passed: boolean; feedback: PoseFeedbackItem[] } {
  const idx = userFrames.length > 0 ? getIdx(userFrames[0]!) : null;
  if (!idx) {
    return {
      passed: false,
      feedback: [{ id: 'knee-landmarks', message: 'Hip/knee landmarks not detected clearly enough', severity: 'hint' }],
    };
  }

  let firstRight = -1;
  let firstLeft = -1;

  for (let i = 0; i < userFrames.length; i += 1) {
    const f = userFrames[i]!;
    if (firstRight < 0 && rightKneeUp(f, idx)) firstRight = i;
    if (firstLeft < 0 && leftKneeUp(f, idx)) firstLeft = i;
  }

  const feedback: PoseFeedbackItem[] = [];
  if (firstRight < 0) {
    feedback.push({
      id: 'lead-right-knee',
      message: 'Start with your lead high knee (right knee above hip line)',
      severity: 'hint',
    });
  }
  if (firstLeft < 0) {
    feedback.push({
      id: 'rear-left-knee',
      message: 'Follow with your rear high knee (left knee above hip line)',
      severity: 'hint',
    });
  }
  // Same frame can briefly show both knees "up" during the switch — that is not wrong order.
  if (firstRight >= 0 && firstLeft >= 0 && firstLeft < firstRight) {
    feedback.push({
      id: 'knee-order',
      message: 'Do the right knee first, then the left knee',
      severity: 'warning',
    });
  }

  return { passed: feedback.length === 0, feedback };
}

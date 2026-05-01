import type { PoseFrame } from '../../types';
import type { RepDetectorResult } from '../types';

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function isFacingRightSide(frame: PoseFrame): boolean {
  const pick = frame.length > 17
    ? { nose: 0, ls: 11, rs: 12 }
    : { nose: 0, ls: 5, rs: 6 };
  if (frame.length <= Math.max(pick.nose, pick.ls, pick.rs)) return false;
  const nose = frame[pick.nose];
  const leftShoulder = frame[pick.ls];
  const rightShoulder = frame[pick.rs];
  if (!validPoint(nose) || !validPoint(leftShoulder) || !validPoint(rightShoulder)) return false;

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const RIGHT_FACING_NOSE_OFFSET = 0.015;
  return nose.x > shoulderMidX + RIGHT_FACING_NOSE_OFFSET;
}

export function isFacingRightSideStrict(frame: PoseFrame): boolean {
  const pick = frame.length > 17
    ? { nose: 0, ls: 11, rs: 12 }
    : { nose: 0, ls: 5, rs: 6 };
  if (frame.length <= Math.max(pick.nose, pick.ls, pick.rs)) return false;
  const nose = frame[pick.nose];
  const leftShoulder = frame[pick.ls];
  const rightShoulder = frame[pick.rs];
  if (!validPoint(nose) || !validPoint(leftShoulder) || !validPoint(rightShoulder)) return false;

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  // Stricter: only treat as right-profile when clearly sideways.
  const RIGHT_FACING_NOSE_OFFSET = 0.04;
  return nose.x > shoulderMidX + RIGHT_FACING_NOSE_OFFSET;
}

export function isFacingLeftSide(frame: PoseFrame): boolean {
  const pick = frame.length > 17
    ? { nose: 0, ls: 11, rs: 12 }
    : { nose: 0, ls: 5, rs: 6 };
  if (frame.length <= Math.max(pick.nose, pick.ls, pick.rs)) return false;
  const nose = frame[pick.nose];
  const leftShoulder = frame[pick.ls];
  const rightShoulder = frame[pick.rs];
  if (!validPoint(nose) || !validPoint(leftShoulder) || !validPoint(rightShoulder)) return false;

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  // Stricter than right-facing check: avoid false "face left" triggers when user is near-front-facing.
  const LEFT_FACING_NOSE_OFFSET = 0.04;
  return nose.x < shoulderMidX - LEFT_FACING_NOSE_OFFSET;
}

export function buildFacingRightBadRep(frame: PoseFrame, id: string): RepDetectorResult {
  // Disabled: previously forced a bad rep when user faced right.
  // Keep the helper for compatibility with modules that call it.
  void frame;
  void id;
  return { done: false };
}

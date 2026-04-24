/**
 * Rear uppercut rep detector: user's RIGHT hand throws the uppercut, user's LEFT hand in guard.
 * Punching arm = MediaPipe LEFT (indices 11, 13, 15). Guard = MediaPipe RIGHT (12, 14, 16).
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 1000;

const MP = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const MN17 = { ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };

function validArmLandmark(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** User's left hand (guard) = MediaPipe RIGHT: contracted and wrist up. */
function rightHandInGuard(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.rw, idx.re, idx.rs)) return false;
  const rs = frame[idx.rs];
  const re = frame[idx.re];
  const rw = frame[idx.rw];
  if (!validArmLandmark(rs) || !validArmLandmark(re) || !validArmLandmark(rw)) return false;
  const rightDist = Math.sqrt((rw.x - rs.x) ** 2 + (rw.y - rs.y) ** 2);
  const wristUpTol = 0.14;
  const guardMax = 0.26;
  const wristUp = rw.y <= re.y + wristUpTol;
  return rightDist <= guardMax && wristUp;
}

/** Vertical lift for punching arm = MediaPipe LEFT (user's right). */
function punchLift(frame: PoseFrame): number | null {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.lw)) return null;
  const ls = frame[idx.ls];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(lw)) return null;
  return ls.y - lw.y;
}

const UPPERCUT_LIFT_EXTEND_MIN = 0.035;
const UPPERCUT_LIFT_RETRACT_MAX = 0.01;
const UPPERCUT_MIN_REP_FRAMES = 2;
const REAR_UPPERCUT_CENTERLINE_MIN = 0.02;
const BAD_PUNCH_MIN_STREAK = 2;

type UppercutState = 'idle' | 'rising' | 'cooldown';

/** Rear uppercut (user's right hand) must travel across body to opposite side. */
function rearUppercutAcrossBody(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.rs, idx.lw)) return false;
  const ls = frame[idx.ls];
  const rs = frame[idx.rs];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(rs) || !validArmLandmark(lw)) return false;

  const shoulderMidX = (ls.x + rs.x) / 2;
  const towardOppositeSign = Math.sign(rs.x - ls.x) || 1;
  return (lw.x - shoulderMidX) * towardOppositeSign >= REAR_UPPERCUT_CENTERLINE_MIN;
}

function elbowAngleDeg(
  shoulder: { x: number; y: number },
  elbow: { x: number; y: number },
  wrist: { x: number; y: number }
): number {
  const ax = shoulder.x - elbow.x;
  const ay = shoulder.y - elbow.y;
  const bx = wrist.x - elbow.x;
  const by = wrist.y - elbow.y;
  const dot = ax * bx + ay * by;
  const magA = Math.sqrt(ax * ax + ay * ay) || 1e-6;
  const magB = Math.sqrt(bx * bx + by * by) || 1e-6;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Jab/straight detector (captures flat, up-angled, and down-angled straight-line punches). */
function handLooksLikeJabOrStraight(frame: PoseFrame, side: 'left' | 'right'): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx) return false;
  const shoulder = side === 'left' ? frame[idx.ls] : frame[idx.rs];
  const elbow = side === 'left' ? frame[idx.le] : frame[idx.re];
  const wrist = side === 'left' ? frame[idx.lw] : frame[idx.rw];
  if (!validArmLandmark(shoulder) || !validArmLandmark(elbow) || !validArmLandmark(wrist)) return false;
  const ext = Math.sqrt((wrist.x - shoulder.x) ** 2 + (wrist.y - shoulder.y) ** 2);
  if (ext < 0.2) return false;
  const angle = elbowAngleDeg(shoulder, elbow, wrist);
  return angle >= 145;
}

export function createRearUppercutRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: UppercutState = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasDroppedSinceRep = false;
  let badPunchStreak = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const lift = punchLift(frame);
    const uppercutLikeNow =
      lift != null && lift > UPPERCUT_LIFT_EXTEND_MIN && rightHandInGuard(frame) && rearUppercutAcrossBody(frame);

    if (state !== 'rising') {
      if (uppercutLikeNow) {
        badPunchStreak = 0;
      } else {
        const badPunch =
          handLooksLikeJabOrStraight(frame, 'left') || handLooksLikeJabOrStraight(frame, 'right');
        badPunchStreak = badPunch ? badPunchStreak + 1 : 0;
      }

      if (badPunchStreak >= BAD_PUNCH_MIN_STREAK) {
        const out = segment.length > 0 ? [...segment, frame] : [frame];
        state = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        segment = [];
        hasDroppedSinceRep = false;
        badPunchStreak = 0;
        return {
          done: true,
          segment: out,
          forcedBadRep: true,
          feedback: [{
            id: 'rear-uppercut-jab-straight-bad-rep',
            message: 'Bad Repetition — you threw a jab/straight line (flat/up/down). Throw a rear uppercut upward.',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }
    }

    if (state === 'cooldown') {
      if (lift != null && lift < UPPERCUT_LIFT_RETRACT_MAX) hasDroppedSinceRep = true;
      if (now >= cooldownUntil && hasDroppedSinceRep) state = 'idle';
      return { done: false };
    }

    if (lift == null) return { done: false };

    if (state === 'idle') {
      if (lift > UPPERCUT_LIFT_EXTEND_MIN && rightHandInGuard(frame) && rearUppercutAcrossBody(frame)) {
        state = 'rising';
        segment = [frame];
      }
      return { done: false };
    }

    if (state === 'rising') {
      segment.push(frame);
      if (!rightHandInGuard(frame) || !rearUppercutAcrossBody(frame)) {
        state = 'idle';
        segment = [];
        badPunchStreak = 0;
        return { done: false };
      }
      if (lift < UPPERCUT_LIFT_RETRACT_MAX) {
        state = 'idle';
        segment = [];
        badPunchStreak = 0;
        return { done: false };
      }
      if (segment.length >= UPPERCUT_MIN_REP_FRAMES) {
        const out = [...segment];
        segment = [];
        state = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasDroppedSinceRep = false;
        badPunchStreak = 0;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    return { done: false };
  };
}

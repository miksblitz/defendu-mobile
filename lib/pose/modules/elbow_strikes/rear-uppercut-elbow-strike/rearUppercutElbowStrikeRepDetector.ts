/**
 * Rear uppercut elbow strike rep detector (rear-hand / rear-uppercut-elbow focus).
 *
 * Since we don’t have a dedicated CSV tune in this file, we implement a
 * flexible rule based on the *relative* elbow lifts:
 * - rear elbow = the elbow with the lower lift (the other elbow is the lead/front elbow)
 * - count a rep when the rear elbow becomes clearly lifted for a short hold
 *
 * This follows the "good-final-pose" philosophy: transitions and other-hand
 * motion are ignored.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';

const MP = { ls: 11, le: 13, lw: 15, rs: 12, re: 14, rw: 16 };
const MN17 = { ls: 5, le: 7, lw: 9, rs: 6, re: 8, rw: 10 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function metricsFromIndices(
  frame: PoseFrame,
  shoulderIdx: number,
  elbowIdx: number,
  wristIdx: number
): { elbowLift: number; elbowFromShoulder: number; wristAboveElbow: number } | null {
  if (frame.length <= Math.max(shoulderIdx, elbowIdx, wristIdx)) return null;
  const shoulder = frame[shoulderIdx];
  const elbow = frame[elbowIdx];
  const wrist = frame[wristIdx];
  if (!validPoint(shoulder) || !validPoint(elbow) || !validPoint(wrist)) return null;

  const elbowLift = shoulder.y - elbow.y;
  const elbowFromShoulder = Math.abs(elbow.x - shoulder.x);
  const wristAboveElbow = elbow.y - wrist.y;
  return { elbowLift, elbowFromShoulder, wristAboveElbow };
}

function bestMetricsForSide(frame: PoseFrame, side: 'left' | 'right') {
  const mp = side === 'left'
    ? metricsFromIndices(frame, MP.ls, MP.le, MP.lw)
    : metricsFromIndices(frame, MP.rs, MP.re, MP.rw);
  const mn = side === 'left'
    ? metricsFromIndices(frame, MN17.ls, MN17.le, MN17.lw)
    : metricsFromIndices(frame, MN17.rs, MN17.re, MN17.rw);
  if (!mp && !mn) return null;
  if (!mp) return mn!;
  if (!mn) return mp;
  return mp.elbowLift >= mn.elbowLift ? mp : mn;
}

const COOLDOWN_MS = 1000;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
const MIN_REP_FRAMES = 1;
const GOOD_MIN_REAR_ELBOW_LIFT = 0.10;
const GOOD_MAX_REAR_ELBOW_FROM_SHOULDER = 0.35;
const GOOD_MAX_REAR_WRIST_ABOVE_ELBOW = 1.0;
const REAR_UPPERCUT_CENTERLINE_MIN = 0.005;

type State = 'idle' | 'holding' | 'cooldown';

function rearUppercutAcrossBody(frame: PoseFrame): boolean {
  const pick = frame.length > 17
    ? { ls: MP.ls, rs: MP.rs, le: MP.le, lw: MP.lw }
    : { ls: MN17.ls, rs: MN17.rs, le: MN17.le, lw: MN17.lw };
  if (frame.length <= Math.max(pick.ls, pick.rs, pick.le, pick.lw)) return false;
  const ls = frame[pick.ls];
  const rs = frame[pick.rs];
  const le = frame[pick.le];
  const lw = frame[pick.lw];
  if (!validPoint(ls) || !validPoint(rs) || !validPoint(le) || !validPoint(lw)) return false;

  const shoulderMidX = (ls.x + rs.x) / 2;
  const towardOppositeSign = Math.sign(rs.x - ls.x) || 1;
  const elbowAcross = (le.x - shoulderMidX) * towardOppositeSign >= REAR_UPPERCUT_CENTERLINE_MIN;
  const wristAcross = (lw.x - shoulderMidX) * towardOppositeSign >= REAR_UPPERCUT_CENTERLINE_MIN;
  return elbowAcross || wristAcross;
}

function classifyRearPoseAttempt(frame: PoseFrame): 'none' | 'valid' | 'opposite_only' | 'rear-same-side' {
  const left = bestMetricsForSide(frame, 'left');
  const right = bestMetricsForSide(frame, 'right');
  if (!left && !right) return 'none';

  const leftOk =
    !!left &&
    left.elbowLift >= GOOD_MIN_REAR_ELBOW_LIFT &&
    left.elbowFromShoulder <= GOOD_MAX_REAR_ELBOW_FROM_SHOULDER &&
    left.wristAboveElbow <= GOOD_MAX_REAR_WRIST_ABOVE_ELBOW;
  const rightOk =
    !!right &&
    right.elbowLift >= GOOD_MIN_REAR_ELBOW_LIFT &&
    right.elbowFromShoulder <= GOOD_MAX_REAR_ELBOW_FROM_SHOULDER &&
    right.wristAboveElbow <= GOOD_MAX_REAR_WRIST_ABOVE_ELBOW;
  const rearAcross = rearUppercutAcrossBody(frame);

  // Rear-side success requires across-body path.
  if (leftOk && rearAcross) return 'valid';
  // Rear arm moved but stayed same side: explicit bad rep.
  if (leftOk && !rearAcross) return 'rear-same-side';
  // Opposite side only (without rear side) is a bad rep.
  if (rightOk) return 'opposite_only';
  return 'none';
}

function isFacingRightSide(frame: PoseFrame): boolean {
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

export function createRearUppercutElbowStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: State = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let retractFrames = 0;
  let rightFacingBadUntil = 0;
  const MIN_RETRACT_FRAMES = 2;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const facingRight = isFacingRightSide(frame);
    const attemptClass = classifyRearPoseAttempt(frame);
    const attempt = attemptClass === 'valid';

    if (state === 'cooldown') {
      if (!attempt) retractFrames = Math.min(retractFrames + 1, MIN_RETRACT_FRAMES);
      else retractFrames = 0;
      if (now >= cooldownUntil && retractFrames >= MIN_RETRACT_FRAMES) {
        state = 'idle';
        segment = [];
        retractFrames = 0;
      }
      return { done: false };
    }

    if (facingRight && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      state = 'idle';
      segment = [];
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'rear-uppercut-elbow-facing-right-bad-rep',
          message: 'FACE LEFT!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (attemptClass === 'opposite_only') {
      // If user performs the opposite (lead) uppercut elbow motion, ignore it for this module
      // rather than forcing a bad rep.
      state = 'idle';
      segment = [];
      retractFrames = 0;
      return { done: false };
    }

    if (attemptClass === 'rear-same-side') {
      const out = segment.length > 0 ? [...segment, frame] : [frame];
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      segment = [];
      retractFrames = 0;
      return {
        done: true,
        segment: out,
        forcedBadRep: true,
        feedback: [{
          id: 'rear-uppercut-elbow-same-side-bad-rep',
          message: 'WRONG DIRECTION!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (state === 'idle') {
      if (attempt) {
        state = 'holding';
        segment = [frame];
      }
      return { done: false };
    }

    if (!attempt) {
      state = 'idle';
      segment = [];
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      retractFrames = 0;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}


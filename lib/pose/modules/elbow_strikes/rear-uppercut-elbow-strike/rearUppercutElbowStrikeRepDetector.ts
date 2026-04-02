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
const MIN_REP_FRAMES = 1;
const GOOD_MIN_REAR_ELBOW_LIFT = 0.10;
const GOOD_MAX_REAR_ELBOW_FROM_SHOULDER = 0.35;
const GOOD_MAX_REAR_WRIST_ABOVE_ELBOW = 1.0;

type State = 'idle' | 'holding' | 'cooldown';

function isRearPoseAttemptOk(frame: PoseFrame): boolean {
  const left = bestMetricsForSide(frame, 'left');
  const right = bestMetricsForSide(frame, 'right');
  if (!left && !right) return false;

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

  return leftOk || rightOk;
}

export function createRearUppercutElbowStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: State = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let retractFrames = 0;
  const MIN_RETRACT_FRAMES = 2;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const attempt = isRearPoseAttemptOk(frame);

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


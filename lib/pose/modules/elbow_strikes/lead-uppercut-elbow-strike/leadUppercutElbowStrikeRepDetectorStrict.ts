/**
 * Lead uppercut elbow strike rep detector (STRICT: strike arm only + guard-up other hand).
 *
 * Interpretation for this dataset:
 * - Strike arm = user LEFT hand => MediaPipe "right arm" landmarks.
 *   MediaPipe indices: shoulder 12, elbow 14, wrist 16
 *   MoveNet 17 indices: shoulder 6, elbow 8, wrist 10
 * - Guard-up other hand = user RIGHT hand => MediaPipe "left arm" landmarks.
 *   MediaPipe indices: shoulder 11, elbow 13, wrist 15
 *   MoveNet 17 indices: shoulder 5, elbow 7, wrist 9
 *
 * Counting logic:
 * - A rep segment is emitted when BOTH (strike attempt) and (guard-up) are true
 *   for MIN_REP_FRAMES consecutive frames.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';

const MP_RIGHT = { sh: 12, el: 14, wr: 16 };
const MN17_RIGHT = { sh: 6, el: 8, wr: 10 };
const MP_LEFT = { sh: 11, el: 13, wr: 15 };
const MN17_LEFT = { sh: 5, el: 7, wr: 9 };

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

function bestRightStrikeMetrics(frame: PoseFrame) {
  const mp = metricsFromIndices(frame, MP_RIGHT.sh, MP_RIGHT.el, MP_RIGHT.wr);
  const mn = metricsFromIndices(frame, MN17_RIGHT.sh, MN17_RIGHT.el, MN17_RIGHT.wr);
  if (!mp && !mn) return null;
  if (!mp) return mn!;
  if (!mn) return mp;
  return mp.elbowLift >= mn.elbowLift ? mp : mn;
}

function bestLeftGuardMetrics(frame: PoseFrame) {
  const mp = metricsFromIndices(frame, MP_LEFT.sh, MP_LEFT.el, MP_LEFT.wr);
  const mn = metricsFromIndices(frame, MN17_LEFT.sh, MN17_LEFT.el, MN17_LEFT.wr);
  if (!mp && !mn) return null;
  if (!mp) return mn!;
  if (!mn) return mp;
  return mp.wristAboveElbow >= mn.wristAboveElbow ? mp : mn;
}

function bestLeftStrikeMetrics(frame: PoseFrame) {
  const mp = metricsFromIndices(frame, MP_LEFT.sh, MP_LEFT.el, MP_LEFT.wr);
  const mn = metricsFromIndices(frame, MN17_LEFT.sh, MN17_LEFT.el, MN17_LEFT.wr);
  if (!mp && !mn) return null;
  if (!mp) return mn!;
  if (!mn) return mp;
  return mp.elbowLift >= mn.elbowLift ? mp : mn;
}

const COOLDOWN_MS = 1000;
/** Debounce repeated GUARD UP! while strike pose is held without a guard (ms). */
const BAD_REP_COOLDOWN_MS = 600;
const MIN_REP_FRAMES = 1;
const ATTEMPT_MIN_RIGHT_ELBOW_LIFT = 0.0;
const ATTEMPT_MAX_RIGHT_ELBOW_FROM_SHOULDER = 0.45;
const GUARD_UP_MIN_WRIST_ABOVE_ELBOW = 0.07;
const STRIKE_MAX_WRIST_ABOVE_ELBOW = 0.05;

/** Strike-arm portion of the perfect-rep check (no guard requirement). */
function isStrikeAttempt(frame: PoseFrame): boolean {
  const strike = bestRightStrikeMetrics(frame);
  if (!strike) return false;
  return (
    strike.elbowLift >= ATTEMPT_MIN_RIGHT_ELBOW_LIFT &&
    strike.elbowFromShoulder <= ATTEMPT_MAX_RIGHT_ELBOW_FROM_SHOULDER &&
    strike.wristAboveElbow <= STRIKE_MAX_WRIST_ABOVE_ELBOW
  );
}

/** True when the opposite (guard) hand is up at chin/face level. */
function isGuardUp(frame: PoseFrame): boolean {
  const guard = bestLeftGuardMetrics(frame);
  if (!guard) return false;
  return guard.wristAboveElbow >= GUARD_UP_MIN_WRIST_ABOVE_ELBOW;
}

function isOppositeHandStrike(frame: PoseFrame): boolean {
  const opposite = bestLeftStrikeMetrics(frame);
  if (!opposite) return false;
  return (
    opposite.elbowLift >= ATTEMPT_MIN_RIGHT_ELBOW_LIFT &&
    opposite.elbowFromShoulder <= ATTEMPT_MAX_RIGHT_ELBOW_FROM_SHOULDER &&
    opposite.wristAboveElbow <= STRIKE_MAX_WRIST_ABOVE_ELBOW
  );
}

export function createLeadUppercutElbowStrikeRepDetectorStrict(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: 'idle' | 'holding' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let retractFrames = 0;
  const MIN_RETRACT_FRAMES = 2;
  let badRepCooldownUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const attempt = isStrikeAttempt(frame);
    const guardOk = isGuardUp(frame);
    const oppositeStrike = isOppositeHandStrike(frame);

    if (state === 'cooldown') {
      if (!attempt) retractFrames = Math.min(retractFrames + 1, MIN_RETRACT_FRAMES);
      else retractFrames = 0;
      if (now >= cooldownUntil) {
        if (retractFrames >= MIN_RETRACT_FRAMES) {
          state = 'idle';
          segment = [];
          retractFrames = 0;
        }
      }
      return { done: false };
    }

    if (oppositeStrike) {
      state = 'cooldown';
      segment = [];
      cooldownUntil = now + COOLDOWN_MS;
      retractFrames = 0;
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'lead-uppercut-elbow-opposite-hand-bad-rep',
          message: 'WRONG ARM!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (!attempt) {
      state = 'idle';
      segment = [];
      return { done: false };
    }

    // Rep moment: idle → first frame of the strike pose.
    if (state === 'idle') {
      if (!guardOk) {
        if (now < badRepCooldownUntil) return { done: false };
        badRepCooldownUntil = now + BAD_REP_COOLDOWN_MS;
        segment = [];
        return {
          done: true,
          segment: [frame],
          forcedBadRep: true,
          feedback: [{
            id: 'guard-down-elbow-strike',
            message: 'GUARD UP!',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }
      state = 'holding';
      segment = [frame];
      if (segment.length >= MIN_REP_FRAMES) {
        const out = [...segment];
        segment = [];
        state = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        retractFrames = 0;
        return { done: true, segment: out };
      }
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


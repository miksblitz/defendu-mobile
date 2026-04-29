import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { createOrthodoxJabRepDetector } from '../jab';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';

const COMBO_TIMEOUT_MS = 4000;
const COMBO_COOLDOWN_MS = 900;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
const COMBO_SIDEWAYS_TOL = 0.24;
const WRONG_STRAIGHT_MIN_STREAK = 2;

type Phase = 'need_jab' | 'need_uppercut' | 'cooldown';

type ArmSide = 'left' | 'right';

function getArmShoulderWrist(frame: PoseFrame, side: ArmSide): { shoulderY: number; wristY: number } | null {
  const isMP = frame.length > 17;
  const idx = isMP
    ? (side === 'left' ? { s: 11, w: 15 } : { s: 12, w: 16 })
    : frame.length >= 11
      ? (side === 'left' ? { s: 5, w: 9 } : { s: 6, w: 10 })
      : null;
  if (!idx) return null;
  if (frame.length <= Math.max(idx.s, idx.w)) return null;
  const shoulder = frame[idx.s];
  const wrist = frame[idx.w];
  if (!shoulder || !wrist) return null;
  if (!Number.isFinite(shoulder.y) || !Number.isFinite(wrist.y)) return null;
  return { shoulderY: shoulder.y, wristY: wrist.y };
}

function isPunchSideways(frame: PoseFrame, punchingSide: ArmSide): boolean {
  const y = getArmShoulderWrist(frame, punchingSide);
  if (!y) return false;
  return Math.abs(y.wristY - y.shoulderY) <= COMBO_SIDEWAYS_TOL;
}

function jabAttemptDetected(frame: PoseFrame): boolean {
  // Jab in this combo = user's LEFT arm = normalized "right" side.
  const y = getArmShoulderWrist(frame, 'right');
  if (!y) return false;
  const dx = Math.abs(y.wristY - y.shoulderY);
  // Any clearly extended attempt with visible displacement can count as an attempt.
  return dx >= 0.12 || isPunchSideways(frame, 'right');
}

const MP = { ls: 11, lw: 15 };
const MN17 = { ls: 5, lw: 9 };

function validArmLandmark(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
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

/** Straight/jab-line detector (flat/up/down angles), used to flag wrong move in jab+uppercut combo. */
function handLooksLikeStraight(frame: PoseFrame, side: ArmSide): boolean {
  const isMP = frame.length > 17;
  const idx = isMP
    ? (side === 'left' ? { s: 11, e: 13, w: 15 } : { s: 12, e: 14, w: 16 })
    : frame.length >= 11
      ? (side === 'left' ? { s: 5, e: 7, w: 9 } : { s: 6, e: 8, w: 10 })
      : null;
  if (!idx || frame.length <= Math.max(idx.s, idx.e, idx.w)) return false;
  const shoulder = frame[idx.s];
  const elbow = frame[idx.e];
  const wrist = frame[idx.w];
  if (!validArmLandmark(shoulder) || !validArmLandmark(elbow) || !validArmLandmark(wrist)) return false;
  const ext = Math.sqrt((wrist.x - shoulder.x) ** 2 + (wrist.y - shoulder.y) ** 2);
  if (ext < 0.2) return false;
  const angle = elbowAngleDeg(shoulder, elbow, wrist);
  return angle >= 150;
}

/** Rear uppercut lift: user's RIGHT hand = MediaPipe LEFT shoulder/wrist. */
function rearUppercutLift(frame: PoseFrame): number | null {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.lw)) return null;
  const ls = frame[idx.ls];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(lw)) return null;
  return ls.y - lw.y;
}

/** Rear uppercut elbow lift: user's RIGHT elbow should rise with the strike. */
function rearUppercutElbowLift(frame: PoseFrame): number | null {
  const isMP = frame.length > 17;
  const idx = isMP
    ? { ls: 11, le: 13 }
    : frame.length >= 11
      ? { ls: 5, le: 7 }
      : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.le)) return null;
  const ls = frame[idx.ls];
  const le = frame[idx.le];
  if (!validArmLandmark(ls) || !validArmLandmark(le)) return null;
  return ls.y - le.y;
}

const UPPERCUT_LIFT_EXTEND_MIN = 0.028;
const UPPERCUT_ELBOW_EXTEND_MIN = 0.0;
const UPPERCUT_LIFT_RETRACT_MAX = 0.015;
const UPPERCUT_MIN_REP_FRAMES = 3;
const UPPERCUT_COOLDOWN_MS = 1000;

/**
 * Rear uppercut for combos: same lift heuristic as `createRearUppercutRepDetector`
 * but does NOT require the lead hand to be in guard (jab arm may still be out).
 */
function createComboRearUppercutRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'rising' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  /** Require rear hand low before counting a new uppercut (avoids instant fire after jab). */
  let sawRearHandLow = false;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const lift = rearUppercutLift(frame);
    const elbowLift = rearUppercutElbowLift(frame);
    const straightLike = handLooksLikeStraight(frame, 'left');

    if (phase === 'cooldown') {
      if (lift != null && lift < UPPERCUT_LIFT_RETRACT_MAX) sawRearHandLow = true;
      if (now >= cooldownUntil && sawRearHandLow) phase = 'idle';
      return { done: false };
    }

    if (lift == null) return { done: false };

    if (phase === 'idle') {
      if (lift < UPPERCUT_LIFT_RETRACT_MAX) sawRearHandLow = true;
      if (
        sawRearHandLow &&
        lift > UPPERCUT_LIFT_EXTEND_MIN &&
        elbowLift != null &&
        elbowLift >= UPPERCUT_ELBOW_EXTEND_MIN &&
        !straightLike
      ) {
        phase = 'rising';
        segment = [frame];
      }
      return { done: false };
    }

    if (phase === 'rising') {
      segment.push(frame);
      if (straightLike) {
        phase = 'idle';
        segment = [];
        return { done: false };
      }
      if (lift < UPPERCUT_LIFT_RETRACT_MAX) {
        phase = 'idle';
        segment = [];
        return { done: false };
      }
      if (segment.length >= UPPERCUT_MIN_REP_FRAMES) {
        const out = [...segment];
        segment = [];
        phase = 'cooldown';
        cooldownUntil = now + UPPERCUT_COOLDOWN_MS;
        sawRearHandLow = false;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    return { done: false };
  };
}

/**
 * Jab → rear uppercut combo:
 * - Perfect rep only after lead (or orthodox) jab, then rear uppercut within the timeout.
 * - Uppercut-first or jab-only does not count.
 */
export function createJabUppercutComboRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: Phase = 'need_jab';

  let orthodoxJabTick = createOrthodoxJabRepDetector();
  let uppercutTick = createComboRearUppercutRepDetector();

  let jabSegment: PoseFrame[] | null = null;
  let uppercutDeadlineMs = 0;
  let cooldownUntilMs = 0;
  let wrongStraightStreak = 0;
  let uppercutStraightStreak = 0;
  let rightFacingBadUntil = 0;

  function resetToNeedJab() {
    phase = 'need_jab';
    orthodoxJabTick = createOrthodoxJabRepDetector();
    uppercutTick = createComboRearUppercutRepDetector();
    jabSegment = null;
    uppercutDeadlineMs = 0;
    cooldownUntilMs = 0;
    wrongStraightStreak = 0;
    uppercutStraightStreak = 0;
  }

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      resetToNeedJab();
      return buildFacingRightBadRep(frame, 'jab-uppercut-combo-facing-right-bad-rep');
    }

    if (phase === 'cooldown') {
      if (now >= cooldownUntilMs) resetToNeedJab();
      return { done: false };
    }

    if (phase === 'need_jab') {
      const jabLineBadNow = jabAttemptDetected(frame) && !isPunchSideways(frame, 'right');
      if (jabLineBadNow) {
        resetToNeedJab();
        return {
          done: true,
          segment: [frame],
          forcedBadRep: true,
          feedback: [{
            id: 'combo-jab-line-bad-rep-uppercut',
            message: 'TOO HIGH/TOO LOW!',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }

      // Strict sequencing for this combo: only accept orthodox jab as the first move.
      const jabRes = orthodoxJabTick(frame, now);

      if (jabRes.done) {
        if (!isPunchSideways(frame, 'right')) {
          const badSeg = jabRes.segment && jabRes.segment.length > 0 ? [...jabRes.segment] : [frame];
          resetToNeedJab();
          return {
            done: true,
            segment: badSeg,
            forcedBadRep: true,
            feedback: [{
              id: 'combo-jab-line-bad-rep-uppercut',
              message: 'TOO HIGH/TOO LOW!',
              severity: 'error',
              phase: 'impact',
            }],
          };
        }
        jabSegment = jabRes.segment;
        phase = 'need_uppercut';
        uppercutTick = createComboRearUppercutRepDetector();
        uppercutDeadlineMs = now + COMBO_TIMEOUT_MS;
        wrongStraightStreak = 0;
        uppercutStraightStreak = 0;
      } else {
        // In jab+uppercut combo, "straight" wrong move is the opposite arm (user's right),
        // which maps to normalized left side. Do not treat the jab arm as straight.
        const wrongStraight = handLooksLikeStraight(frame, 'left');
        wrongStraightStreak = wrongStraight ? wrongStraightStreak + 1 : 0;
        if (wrongStraightStreak >= WRONG_STRAIGHT_MIN_STREAK) {
          resetToNeedJab();
          return {
            done: true,
            segment: [frame],
            forcedBadRep: true,
            feedback: [{
              id: 'combo-straight-bad-rep-uppercut',
              message: 'WRONG COMBO!',
              severity: 'error',
              phase: 'impact',
            }],
          };
        }
      }
      return { done: false };
    }

    if (now > uppercutDeadlineMs) {
      resetToNeedJab();
      return { done: false };
    }

    const uppercutStraightNow = handLooksLikeStraight(frame, 'left');
    uppercutStraightStreak = uppercutStraightNow ? uppercutStraightStreak + 1 : 0;
    if (uppercutStraightStreak >= WRONG_STRAIGHT_MIN_STREAK) {
      resetToNeedJab();
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'combo-uppercut-straight-bad-rep',
          message: 'WRONG COMBO!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    const upRes = uppercutTick(frame, now);
    if (!upRes.done) return { done: false };

    const jab = jabSegment;
    if (!jab || jab.length === 0) {
      resetToNeedJab();
      return { done: false };
    }

    const combined = [...jab, ...upRes.segment];
    phase = 'cooldown';
    cooldownUntilMs = now + COMBO_COOLDOWN_MS;
    jabSegment = null;
    return { done: true, segment: combined };
  };
}

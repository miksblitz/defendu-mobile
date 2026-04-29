/**
 * Rear uppercut rep detector: user's RIGHT hand throws the uppercut.
 * Detects a rep when the rear hand travels clearly upward (not just straight forward).
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';

const COOLDOWN_MS = 1000;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;

// MediaPipe / MoveNet arm landmark indices
const MP = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const MN17 = { ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };

function validArmLandmark(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** Vertical lift metrics for punching arm = MediaPipe LEFT (user's right). */
function punchMetrics(frame: PoseFrame): { lift: number | null; elbowLift: number | null } {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.le, idx.lw)) {
    return { lift: null, elbowLift: null };
  }
  const ls = frame[idx.ls];
  const le = frame[idx.le];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(le) || !validArmLandmark(lw)) {
    return { lift: null, elbowLift: null };
  }
  // Positive when wrist/elbow rise above shoulder.
  const lift = ls.y - lw.y;
  const elbowLift = ls.y - le.y;
  return { lift, elbowLift };
}

// Tuned heuristics for uppercut motion (from guard -> drive up high)
const UPPERCUT_LIFT_EXTEND_MIN = 0.04; // entering rising phase: wrist clearly above shoulder
const UPPERCUT_ELBOW_EXTEND_MIN = 0.0; // elbow should at least reach shoulder height
const UPPERCUT_LIFT_HIGH_TARGET = 0.055; // peak lift target for a convincing high uppercut
const UPPERCUT_LIFT_RETRACT_MAX = 0.01; // setup "down" position: wrist near/below shoulder
const UPPERCUT_MIN_REP_FRAMES = 5;
const UPPERCUT_SAME_SIDE_BUFFER = 0.01;
const BAD_REP_MIN_STREAK = 2;
const WRONG_DIRECTION_MIN_STREAK = 1;

type UppercutState = 'idle' | 'rising' | 'cooldown';

/** Rear uppercut wrist should finish on SCREEN-LEFT side (user's required direction). */
function rearUppercutSameSide(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.rs, idx.lw)) return false;
  const ls = frame[idx.ls];
  const rs = frame[idx.rs];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(rs) || !validArmLandmark(lw)) return false;

  const shoulderMidX = (ls.x + rs.x) / 2;
  // Rear uppercut target for this module is explicitly to the left side on-screen.
  return lw.x <= shoulderMidX - UPPERCUT_SAME_SIDE_BUFFER;
}

/** Wrong-hand uppercut attempt: user's LEFT hand rising like an uppercut (lead uppercut). */
function wrongHandUppercutAttempt(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.rs, idx.re, idx.rw)) return false;
  const rs = frame[idx.rs];
  const re = frame[idx.re];
  const rw = frame[idx.rw];
  if (!validArmLandmark(rs) || !validArmLandmark(re) || !validArmLandmark(rw)) return false;
  const lift = rs.y - rw.y;
  const elbowLift = rs.y - re.y;
  const ext = Math.sqrt((rw.x - rs.x) ** 2 + (rw.y - rs.y) ** 2);
  return ext >= 0.14 && lift >= UPPERCUT_LIFT_EXTEND_MIN && elbowLift >= UPPERCUT_ELBOW_EXTEND_MIN;
}

function buildWrongDirectionBadRep(segment: PoseFrame[], frame: PoseFrame): RepDetectorResult {
  const out = segment.length > 0 ? [...segment, frame] : [frame];
  return {
    done: true,
    segment: out,
    forcedBadRep: true,
    feedback: [
      {
        id: 'rear-uppercut-wrong-direction-bad-rep',
        message: 'WRONG DIRECTION!',
        severity: 'error',
        phase: 'impact',
      },
    ],
  };
}

function buildWrongHandBadRep(segment: PoseFrame[], frame: PoseFrame): RepDetectorResult {
  const out = segment.length > 0 ? [...segment, frame] : [frame];
  return {
    done: true,
    segment: out,
    forcedBadRep: true,
    feedback: [
      {
        id: 'rear-uppercut-wrong-hand-bad-rep',
        message: 'WRONG ARM!',
        severity: 'error',
        phase: 'impact',
      },
    ],
  };
}

/** Rear uppercut: rep when punch lift goes from low to clearly high while guard is maintained. */
export function createRearUppercutRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: UppercutState = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasDroppedSinceRep = false;
  let readyFromNeutral = false;
  let peakLift = -Infinity;
  let wrongHandStreak = 0;
  let wrongDirectionStreak = 0;
  let rightFacingBadUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      state = 'idle';
      segment = [];
      readyFromNeutral = false;
      peakLift = -Infinity;
      hasDroppedSinceRep = false;
      wrongHandStreak = 0;
      wrongDirectionStreak = 0;
      return buildFacingRightBadRep(frame, 'rear-uppercut-facing-right-bad-rep');
    }

    const { lift, elbowLift } = punchMetrics(frame);
    const wrongHandLike = state === 'idle' && wrongHandUppercutAttempt(frame);

    const wrongDirectionLike =
      state === 'idle' &&
      lift != null &&
      lift > UPPERCUT_LIFT_EXTEND_MIN &&
      !rearUppercutSameSide(frame);
    wrongHandStreak = wrongHandLike ? wrongHandStreak + 1 : 0;
    wrongDirectionStreak = wrongDirectionLike ? wrongDirectionStreak + 1 : 0;

    if (wrongHandStreak >= BAD_REP_MIN_STREAK) {
      const badRep = buildWrongHandBadRep(segment, frame);
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      segment = [];
      readyFromNeutral = false;
      peakLift = -Infinity;
      hasDroppedSinceRep = false;
      wrongHandStreak = 0;
      wrongDirectionStreak = 0;
      return badRep;
    }

    if (wrongDirectionStreak >= WRONG_DIRECTION_MIN_STREAK) {
      const badRep = buildWrongDirectionBadRep(segment, frame);
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      segment = [];
      readyFromNeutral = false;
      peakLift = -Infinity;
      hasDroppedSinceRep = false;
      wrongHandStreak = 0;
      wrongDirectionStreak = 0;
      return badRep;
    }

    if (state === 'cooldown') {
      // Wait until the punch has dropped back down before counting another rep
      if (lift != null && lift < UPPERCUT_LIFT_RETRACT_MAX) {
        hasDroppedSinceRep = true;
      }
      if (now >= cooldownUntil && hasDroppedSinceRep) {
        state = 'idle';
      }
      return { done: false };
    }

    if (lift == null) {
      return { done: false };
    }

    if (state === 'idle') {
      // Require a clear "down" or neutral start
      if (lift < UPPERCUT_LIFT_RETRACT_MAX) {
        readyFromNeutral = true;
      }
      if (
        readyFromNeutral &&
        lift > UPPERCUT_LIFT_EXTEND_MIN &&
        elbowLift != null &&
        elbowLift >= UPPERCUT_ELBOW_EXTEND_MIN &&
        rearUppercutSameSide(frame)
      ) {
        state = 'rising';
        segment = [frame];
        peakLift = lift;
      }
      return { done: false };
    }

    if (state === 'rising') {
      segment.push(frame);
      peakLift = Math.max(peakLift, lift);
      // Rear-hand path must stay valid; lead hand movement is ignored.
      if (!rearUppercutSameSide(frame)) {
        wrongDirectionStreak += 1;
        if (wrongDirectionStreak >= WRONG_DIRECTION_MIN_STREAK) {
          const badRep = buildWrongDirectionBadRep(segment, frame);
          state = 'cooldown';
          cooldownUntil = now + COOLDOWN_MS;
          segment = [];
          readyFromNeutral = false;
          peakLift = -Infinity;
          hasDroppedSinceRep = false;
          wrongHandStreak = 0;
          wrongDirectionStreak = 0;
          return badRep;
        }
      } else {
        wrongDirectionStreak = 0;
      }
      if (lift < UPPERCUT_LIFT_RETRACT_MAX) {
        // Dropped too early; restart
        state = 'idle';
        segment = [];
        readyFromNeutral = true;
        peakLift = -Infinity;
        wrongHandStreak = 0;
        wrongDirectionStreak = 0;
        return { done: false };
      }
      if (segment.length >= UPPERCUT_MIN_REP_FRAMES && peakLift >= UPPERCUT_LIFT_HIGH_TARGET) {
        const out = [...segment];
        segment = [];
        state = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasDroppedSinceRep = false;
        readyFromNeutral = false;
        peakLift = -Infinity;
        wrongHandStreak = 0;
        wrongDirectionStreak = 0;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    return { done: false };
  };
}

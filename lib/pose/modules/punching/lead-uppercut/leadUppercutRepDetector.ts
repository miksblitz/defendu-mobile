/**
 * Lead uppercut rep detector: user's LEFT hand throws the uppercut, user's RIGHT hand in guard.
 * Detects a rep when the punching hand travels clearly upward (not just straight forward)
 * while the rear hand stays in guard.
 */

import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';

const COOLDOWN_MS = 1000;
const BAD_REP_COOLDOWN_MS = 600;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
/** Rear/guard arm extended like a punch while lead not yet rising — wrong-arm context (matches orthodox jab). */
const WRONG_HAND_EXTEND_MIN = 0.23;
// Lenient horizontal band for guard-side “jab line” (wrong arm only if this or uppercut path).
const JAB_LINE_MAX_BELOW_SHOULDER = 0.11;
const JAB_LINE_MAX_ABOVE_SHOULDER = 0.17;

// MediaPipe / MoveNet arm landmark indices
const MP = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const MN17 = { ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };

function validArmLandmark(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** User's right hand (guard) = MediaPipe LEFT: contracted and wrist up. */
function leftHandInGuard(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.lw, idx.le, idx.ls)) return false;
  const ls = frame[idx.ls];
  const le = frame[idx.le];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(le) || !validArmLandmark(lw)) return false;
  const leftDist = Math.sqrt((lw.x - ls.x) ** 2 + (lw.y - ls.y) ** 2);
  const wristUpTol = 0.14;
  const guardMax = 0.26;
  const wristUp = lw.y <= le.y + wristUpTol;
  return leftDist <= guardMax && wristUp;
}

/** Vertical lift metrics for punching arm = MediaPipe RIGHT (user's left). */
function punchMetrics(frame: PoseFrame): { lift: number | null; elbowLift: number | null } {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.rs, idx.re, idx.rw)) {
    return { lift: null, elbowLift: null };
  }
  const rs = frame[idx.rs];
  const re = frame[idx.re];
  const rw = frame[idx.rw];
  if (!validArmLandmark(rs) || !validArmLandmark(re) || !validArmLandmark(rw)) {
    return { lift: null, elbowLift: null };
  }
  // Positive when wrist/elbow rise above shoulder.
  const lift = rs.y - rw.y;
  const elbowLift = rs.y - re.y;
  return { lift, elbowLift };
}

function armExtension(frame: PoseFrame, side: 'left' | 'right'): number | null {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx) return null;
  const s = side === 'left' ? frame[idx.ls] : frame[idx.rs];
  const w = side === 'left' ? frame[idx.lw] : frame[idx.rw];
  if (!validArmLandmark(s) || !validArmLandmark(w)) return null;
  return Math.sqrt((w.x - s.x) ** 2 + (w.y - s.y) ** 2);
}

/** User's guard-side arm (MediaPipe LEFT): shoulder–wrist in horizontal / slight-up band — wrong STRAIGHT arm, not a dangling hand. */
function guardSideJabLineOk(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.lw)) return false;
  const ls = frame[idx.ls];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(lw)) return false;
  const delta = lw.y - ls.y;
  return delta <= JAB_LINE_MAX_BELOW_SHOULDER && delta >= -JAB_LINE_MAX_ABOVE_SHOULDER;
}

/**
 * Detect jab/straight-like action on lead uppercut hand:
 * extension is present, but motion is mostly lateral instead of vertical rise.
 */
function leadHandLooksLikeJabOrStraight(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.rs, idx.rw)) return false;
  const rs = frame[idx.rs];
  const rw = frame[idx.rw];
  if (!validArmLandmark(rs) || !validArmLandmark(rw)) return false;
  const ext = armExtension(frame, 'right');
  if (ext == null || ext < 0.24) return false;
  const dx = Math.abs(rw.x - rs.x);
  const dy = Math.abs(rw.y - rs.y);
  const upwardLift = rs.y - rw.y;
  // If the hand is already driving clearly upward, do not treat it as jab/straight.
  if (upwardLift > UPPERCUT_LIFT_EXTEND_MIN + 0.01) return false;
  // Straight/jab line tends to travel outward more than upward.
  return dx >= dy * 1.25;
}

/** Wrong-hand uppercut attempt: user's RIGHT hand rising like an uppercut. */
function wrongHandUppercutAttempt(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.le, idx.lw)) return false;
  const ls = frame[idx.ls];
  const le = frame[idx.le];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(le) || !validArmLandmark(lw)) return false;
  const lift = ls.y - lw.y;
  const elbowLift = ls.y - le.y;
  const ext = armExtension(frame, 'left');
  return ext != null && ext >= 0.14 && lift >= UPPERCUT_LIFT_EXTEND_MIN && elbowLift >= UPPERCUT_ELBOW_EXTEND_MIN;
}

// Tuned heuristics for uppercut motion (from guard -> drive up high)
const UPPERCUT_LIFT_EXTEND_MIN = 0.04; // entering rising phase: wrist clearly above shoulder
const UPPERCUT_ELBOW_EXTEND_MIN = 0.0; // elbow should at least reach shoulder height
const UPPERCUT_LIFT_HIGH_TARGET = 0.055; // peak lift target for a convincing high uppercut
const UPPERCUT_LIFT_RETRACT_MAX = 0.01; // setup "down" position: wrist near/below shoulder
const UPPERCUT_MIN_REP_FRAMES = 5;
const UPPERCUT_SAME_SIDE_BUFFER = 0.01;
const BAD_REP_MIN_STREAK = 2;
const WRONG_DIRECTION_MIN_STREAK = 2;

function guardUpFeedback(): PoseFeedbackItem[] {
  return [{
    id: 'guard-down-elbow-strike',
    message: 'GUARD UP!',
    severity: 'error',
    phase: 'impact',
  }];
}

type UppercutState = 'idle' | 'rising' | 'cooldown';

/** Lead uppercut punch arm (MediaPipe RIGHT) must stay on its own side, not across body. */
function leadUppercutSameSide(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.rs, idx.rw)) return false;
  const ls = frame[idx.ls];
  const rs = frame[idx.rs];
  const rw = frame[idx.rw];
  if (!validArmLandmark(ls) || !validArmLandmark(rs) || !validArmLandmark(rw)) return false;

  const shoulderMidX = (ls.x + rs.x) / 2;
  const towardRightSign = Math.sign(rs.x - ls.x) || 1;
  // For user's LEFT punch (MediaPipe RIGHT), the wrist should remain on that same side.
  return (rw.x - shoulderMidX) * towardRightSign >= UPPERCUT_SAME_SIDE_BUFFER;
}

/** Lead uppercut: rep when punch lift goes from low to clearly high while guard is maintained. */
export function createLeadUppercutRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: UppercutState = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasDroppedSinceRep = false;
  let readyFromGuard = false;
  let peakLift = -Infinity;
  let badJabStraightStreak = 0;
  let wrongHandStreak = 0;
  let wrongDirectionStreak = 0;
  let rightFacingBadUntil = 0;
  let guardUpBadCooldownUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      state = 'idle';
      segment = [];
      readyFromGuard = false;
      peakLift = -Infinity;
      hasDroppedSinceRep = false;
      badJabStraightStreak = 0;
      wrongHandStreak = 0;
      wrongDirectionStreak = 0;
      return buildFacingRightBadRep(frame, 'lead-uppercut-facing-right-bad-rep');
    }

    const { lift, elbowLift } = punchMetrics(frame);
    const leftExt = armExtension(frame, 'left');
    const wrongRearPunching =
      leftExt != null &&
      leftExt > WRONG_HAND_EXTEND_MIN &&
      lift != null &&
      lift < UPPERCUT_LIFT_EXTEND_MIN;
    const wrongArmQualifies =
      wrongRearPunching &&
      (wrongHandUppercutAttempt(frame) || guardSideJabLineOk(frame));

    // Only judge jab/straight in setup phase. Once a valid rise starts, avoid false bad-rep.
    const jabStraightLike = state === 'idle' && leadHandLooksLikeJabOrStraight(frame);
    const wrongDirectionLike =
      state === 'idle' &&
      lift != null &&
      lift > UPPERCUT_LIFT_EXTEND_MIN &&
      leftHandInGuard(frame) &&
      !leadUppercutSameSide(frame);
    badJabStraightStreak = jabStraightLike ? badJabStraightStreak + 1 : 0;
    wrongHandStreak = wrongArmQualifies ? wrongHandStreak + 1 : 0;
    wrongDirectionStreak = wrongDirectionLike ? wrongDirectionStreak + 1 : 0;

    if (badJabStraightStreak >= BAD_REP_MIN_STREAK) {
      const out = segment.length > 0 ? [...segment, frame] : [frame];
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      segment = [];
      readyFromGuard = false;
      peakLift = -Infinity;
      hasDroppedSinceRep = false;
      badJabStraightStreak = 0;
      wrongHandStreak = 0;
      wrongDirectionStreak = 0;
      return {
        done: true,
        segment: out,
        forcedBadRep: true,
        feedback: [
          {
            id: 'lead-uppercut-jab-straight-bad-rep',
            message: 'NO STRAIGHT!',
            severity: 'error',
            phase: 'impact',
          },
        ],
      };
    }

    if (wrongHandStreak >= BAD_REP_MIN_STREAK) {
      const out = segment.length > 0 ? [...segment, frame] : [frame];
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      segment = [];
      readyFromGuard = false;
      peakLift = -Infinity;
      hasDroppedSinceRep = false;
      badJabStraightStreak = 0;
      wrongHandStreak = 0;
      wrongDirectionStreak = 0;
      return {
        done: true,
        segment: out,
        forcedBadRep: true,
        feedback: [
          {
            id: 'lead-uppercut-wrong-hand-bad-rep',
            message: 'WRONG ARM!',
            severity: 'error',
            phase: 'impact',
          },
        ],
      };
    }

    if (wrongDirectionStreak >= WRONG_DIRECTION_MIN_STREAK) {
      const out = segment.length > 0 ? [...segment, frame] : [frame];
      state = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      segment = [];
      readyFromGuard = false;
      peakLift = -Infinity;
      hasDroppedSinceRep = false;
      badJabStraightStreak = 0;
      wrongHandStreak = 0;
      wrongDirectionStreak = 0;
      return {
        done: true,
        segment: out,
        forcedBadRep: true,
        feedback: [
          {
            id: 'lead-uppercut-wrong-direction-bad-rep',
            message: 'WRONG DIRECTION!',
            severity: 'error',
            phase: 'impact',
          },
        ],
      };
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
      // Lead not yet in the clear “rise” band — arms strokes without requiring opposite hand in guard.
      // (Using only UPPERCUT_LIFT_RETRACT_MAX was too strict in practice and blocked GUARD UP entirely.)
      if (lift < UPPERCUT_LIFT_EXTEND_MIN) {
        readyFromGuard = true;
      }
      if (
        readyFromGuard &&
        lift > UPPERCUT_LIFT_EXTEND_MIN &&
        elbowLift != null &&
        elbowLift >= UPPERCUT_ELBOW_EXTEND_MIN &&
        !leftHandInGuard(frame) &&
        now >= guardUpBadCooldownUntil &&
        !wrongArmQualifies
      ) {
        guardUpBadCooldownUntil = now + BAD_REP_COOLDOWN_MS;
        state = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        segment = [];
        readyFromGuard = false;
        peakLift = -Infinity;
        hasDroppedSinceRep = false;
        badJabStraightStreak = 0;
        wrongHandStreak = 0;
        wrongDirectionStreak = 0;
        return {
          done: true,
          segment: [frame],
          forcedBadRep: true,
          feedback: guardUpFeedback(),
        };
      }
      if (
        readyFromGuard &&
        lift > UPPERCUT_LIFT_EXTEND_MIN &&
        elbowLift != null &&
        elbowLift >= UPPERCUT_ELBOW_EXTEND_MIN &&
        leftHandInGuard(frame) &&
        leadUppercutSameSide(frame)
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
      // GUARD UP before same-side reset — dropping the guard must not be masked by across-body drift.
      if (
        !leftHandInGuard(frame) &&
        lift > UPPERCUT_LIFT_RETRACT_MAX &&
        now >= guardUpBadCooldownUntil
      ) {
        guardUpBadCooldownUntil = now + BAD_REP_COOLDOWN_MS;
        const out = [...segment];
        segment = [];
        state = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasDroppedSinceRep = false;
        readyFromGuard = false;
        peakLift = -Infinity;
        badJabStraightStreak = 0;
        wrongHandStreak = 0;
        wrongDirectionStreak = 0;
        return {
          done: true,
          segment: out,
          forcedBadRep: true,
          feedback: guardUpFeedback(),
        };
      }
      if (!leadUppercutSameSide(frame)) {
        state = 'idle';
        segment = [];
        readyFromGuard = false;
        peakLift = -Infinity;
        badJabStraightStreak = 0;
        wrongHandStreak = 0;
        wrongDirectionStreak = 0;
        return { done: false };
      }
      if (!leftHandInGuard(frame)) {
        state = 'idle';
        segment = [];
        readyFromGuard = false;
        peakLift = -Infinity;
        badJabStraightStreak = 0;
        wrongHandStreak = 0;
        wrongDirectionStreak = 0;
        return { done: false };
      }
      if (lift < UPPERCUT_LIFT_RETRACT_MAX) {
        // Dropped too early; restart
        state = 'idle';
        segment = [];
        readyFromGuard = true;
        peakLift = -Infinity;
        badJabStraightStreak = 0;
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
        readyFromGuard = false;
        peakLift = -Infinity;
        badJabStraightStreak = 0;
        wrongHandStreak = 0;
        wrongDirectionStreak = 0;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    return { done: false };
  };
}

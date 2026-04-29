import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { createOrthodoxJabRepDetectorWithBadRep } from '../orthodox-jab/orthodoxJabRepDetector';
import { createCrossJabRepDetector } from '../cross';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';

const COMBO_TIMEOUT_MS = 3000;
const COMBO_COOLDOWN_MS = 900;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
const COMBO_SIDEWAYS_TOL = 0.24;
const CROSS_CENTERLINE_MIN = 0.0;
const CROSS_TRAVEL_MIN = 0.04;

type Phase = 'need_jab' | 'need_cross' | 'cooldown';

type ArmSide = 'left' | 'right';

function getArmShoulderWrist(frame: PoseFrame, side: ArmSide): { shoulderY: number; wristY: number } | null {
  // MediaPipe: left shoulder/wrist (11,15), right shoulder/wrist (12,16)
  // MoveNet 17: left shoulder/wrist (5,9), right shoulder/wrist (6,10)
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

function isCrossAcrossBody(frame: PoseFrame): boolean {
  // Cross punch in this module = user's RIGHT arm = "left" side in normalized pose coords.
  const isMP = frame.length > 17;
  const idx = isMP
    ? { ls: 11, rs: 12, lw: 15 }
    : frame.length >= 11
      ? { ls: 5, rs: 6, lw: 9 }
      : null;
  if (!idx || frame.length <= Math.max(idx.ls, idx.rs, idx.lw)) return false;
  const ls = frame[idx.ls];
  const rs = frame[idx.rs];
  const lw = frame[idx.lw];
  if (!ls || !rs || !lw) return false;
  if (![ls.x, rs.x, lw.x].every(Number.isFinite)) return false;

  const shoulderMidX = (ls.x + rs.x) / 2;
  const towardOppositeSign = Math.sign(rs.x - ls.x) || 1;
  const crossedCenterline = (lw.x - shoulderMidX) * towardOppositeSign >= CROSS_CENTERLINE_MIN;
  const traveledAwayFromPunchShoulder = (lw.x - ls.x) * towardOppositeSign >= CROSS_TRAVEL_MIN;
  return crossedCenterline && traveledAwayFromPunchShoulder;
}

function crossHandLooksLikeUppercut(frame: PoseFrame): boolean {
  // Cross hand in this module = user's RIGHT arm = normalized left side.
  const isMP = frame.length > 17;
  const idx = isMP
    ? { s: 11, e: 13, w: 15 }
    : frame.length >= 11
      ? { s: 5, e: 7, w: 9 }
      : null;
  if (!idx || frame.length <= Math.max(idx.s, idx.e, idx.w)) return false;
  const shoulder = frame[idx.s];
  const elbow = frame[idx.e];
  const wrist = frame[idx.w];
  if (!shoulder || !elbow || !wrist) return false;
  if (![shoulder.y, elbow.y, wrist.y].every(Number.isFinite)) return false;

  const wristLift = shoulder.y - wrist.y;
  const elbowLift = shoulder.y - elbow.y;
  return wristLift >= 0.03 && elbowLift >= 0.0;
}

/**
 * Cross detector variant for combos:
 * - Detects the punching arm extension like `createCrossJabRepDetector`
 * - BUT does NOT require the non-punching arm to be in guard.
 *
 * Rationale: in a fast 1–2, the jab arm may still be extended while the cross lands.
 */
function createComboCrossRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  // Keep thresholds aligned with cross detector.
  const CROSS_PUNCH_EXTEND_MIN = 0.25;
  const CROSS_PUNCH_RETRACT_MAX = 0.18;
  const COOLDOWN_MS = 1000;

  // Inline arm extension distance for the punching arm.
  // This mirrors cross detector’s use of `armExtensionDistances` without pulling in more deps here.
  function armExtensionDistancesLocal(frame: PoseFrame): { left: number; right: number } | null {
    // MediaPipe: left arm (11,13,15) and right arm (12,14,16)
    // MoveNet 17: left arm (5,7,9) and right arm (6,8,10)
    const isMP = frame.length > 17;
    const idx = isMP
      ? { ls: 11, rs: 12, lw: 15, rw: 16 }
      : frame.length >= 11
        ? { ls: 5, rs: 6, lw: 9, rw: 10 }
        : null;
    if (!idx) return null;
    if (frame.length <= Math.max(idx.ls, idx.rs, idx.lw, idx.rw)) return null;
    const ls = frame[idx.ls];
    const rs = frame[idx.rs];
    const lw = frame[idx.lw];
    const rw = frame[idx.rw];
    if (!ls || !rs || !lw || !rw) return null;
    if (![ls.x, ls.y, rs.x, rs.y, lw.x, lw.y, rw.x, rw.y].every(Number.isFinite)) return null;
    const left = Math.sqrt((lw.x - ls.x) ** 2 + (lw.y - ls.y) ** 2);
    const right = Math.sqrt((rw.x - rs.x) ** 2 + (rw.y - rs.y) ** 2);
    return { left, right };
  }

  function leftExtension(frame: PoseFrame): number | null {
    const d = armExtensionDistancesLocal(frame);
    return d ? d.left : null;
  }

  // Cross = user's RIGHT hand punches = MediaPipe LEFT extension (same as `createCrossJabRepDetector`)
  let phase: 'idle' | 'extended' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasRetractedSinceRep = true; // allow first cross immediately

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      const punch = leftExtension(frame);
      if (punch != null && punch < CROSS_PUNCH_RETRACT_MAX) hasRetractedSinceRep = true;
      if (now >= cooldownUntil && hasRetractedSinceRep) phase = 'idle';
      return { done: false };
    }

    // Cross punching arm = user's RIGHT = MediaPipe/MoveNet LEFT side.
    // Neglect guard requirement, but still require punch to be roughly sideways (slight tilt allowed).
    if (!isPunchSideways(frame, 'left') || !isCrossAcrossBody(frame)) {
      if (phase === 'extended') {
        phase = 'idle';
        segment = [];
      }
      return { done: false };
    }

    const punch = leftExtension(frame);
    if (punch == null) return { done: false };

    if (phase === 'idle') {
      if (punch < CROSS_PUNCH_RETRACT_MAX) hasRetractedSinceRep = true;
      if (hasRetractedSinceRep && punch > CROSS_PUNCH_EXTEND_MIN) {
        // Count immediately on first valid straight impact frame (no hold required).
        const out = [frame];
        segment = [];
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasRetractedSinceRep = false;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    // extended
    segment.push(frame);
    if (punch < CROSS_PUNCH_RETRACT_MAX) {
      phase = 'idle';
      segment = [];
      return { done: false };
    }
    if (segment.length >= 2) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      hasRetractedSinceRep = false;
      return { done: true, segment: out };
    }
    return { done: false };
  };
}

/**
 * 1–2 combo rep detector:
 * - A rep only counts if the user completes a JAB first, then completes a CROSS.
 * - Cross-first does not count. Jab-only does not count.
 * - Once jab is detected, we give a short window to land the cross; otherwise reset.
 */
export function createJabCrossComboRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: Phase = 'need_jab';

  // Strict combo rule: jab must be orthodox left jab first.
  let orthodoxJabTick = createOrthodoxJabRepDetectorWithBadRep();
  let crossTick = createCrossJabRepDetector();

  let jabSegment: PoseFrame[] | null = null;
  let crossDeadlineMs = 0;
  let cooldownUntilMs = 0;
  let rightFacingBadUntil = 0;
  let uppercutInsteadStreak = 0;

  function resetToNeedJab() {
    phase = 'need_jab';
    orthodoxJabTick = createOrthodoxJabRepDetectorWithBadRep();
    crossTick = createCrossJabRepDetector();
    jabSegment = null;
    crossDeadlineMs = 0;
    cooldownUntilMs = 0;
    uppercutInsteadStreak = 0;
  }

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      resetToNeedJab();
      return buildFacingRightBadRep(frame, 'jab-cross-combo-facing-right-bad-rep');
    }

    if (phase === 'cooldown') {
      if (now >= cooldownUntilMs) resetToNeedJab();
      return { done: false };
    }

    if (phase === 'need_jab') {
      const jabRes = orthodoxJabTick(frame, now);

      if (jabRes.done) {
        if ('forcedBadRep' in jabRes && jabRes.forcedBadRep) {
          resetToNeedJab();
          return jabRes;
        }
        // Jab punching arm = user's LEFT = MediaPipe/MoveNet RIGHT side.
        // Require jab to be roughly sideways (slight tilt allowed).
        if (!isPunchSideways(frame, 'right')) {
          const badSeg = jabRes.segment && jabRes.segment.length > 0 ? [...jabRes.segment] : [frame];
          resetToNeedJab();
          return {
            done: true,
            segment: badSeg,
            forcedBadRep: true,
            feedback: [{
              id: 'combo-jab-line-bad-rep',
              message: 'TOO HIGH/TOO LOW!',
              severity: 'error',
              phase: 'impact',
            }],
          };
        }
        jabSegment = jabRes.segment;
        phase = 'need_cross';
        // Use combo-friendly cross detector: doesn't require the jab arm to be back in guard.
        crossTick = createComboCrossRepDetector();
        crossDeadlineMs = now + COMBO_TIMEOUT_MS;
        uppercutInsteadStreak = 0;
      }
      return { done: false };
    }

    // need_cross
    if (now > crossDeadlineMs) {
      const jab = jabSegment;
      resetToNeedJab();
      return {
        done: true,
        segment: jab && jab.length > 0 ? [...jab] : [],
        forcedBadRep: true,
        feedback: [{
          id: 'combo-timeout-bad-rep',
          message: 'FINISH COMBO!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    const uppercutInstead = crossHandLooksLikeUppercut(frame);
    uppercutInsteadStreak = uppercutInstead ? uppercutInsteadStreak + 1 : 0;
    if (uppercutInsteadStreak >= 2) {
      const jab = jabSegment;
      resetToNeedJab();
      return {
        done: true,
        segment: jab && jab.length > 0 ? [...jab, frame] : [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'combo-uppercut-instead-of-straight-bad-rep',
          message: 'WRONG COMBO!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    const crossRes = crossTick(frame, now);
    if (!crossRes.done) return { done: false };

    const jab = jabSegment;
    if (!jab || jab.length === 0) {
      // Shouldn't happen, but keep it safe.
      resetToNeedJab();
      return { done: false };
    }

    const combined = [...jab, ...crossRes.segment];
    phase = 'cooldown';
    cooldownUntilMs = now + COMBO_COOLDOWN_MS;
    jabSegment = null;
    return { done: true, segment: combined };
  };
}


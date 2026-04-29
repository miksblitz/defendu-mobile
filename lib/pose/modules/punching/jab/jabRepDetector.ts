/**
 * Jab-specific rep detectors: lead jab (pose hold) and orthodox jab (left extends, right guard, motion required).
 * Used by punching modules that need jab-only counting.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';

const COOLDOWN_MS = 1000;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
const LEAD_JAB_MIN_FRAMES = 3;
const PUNCH_MAX_BELOW_SHOULDER = 0.11;
const PUNCH_MAX_ABOVE_SHOULDER = 0.17;

// MediaPipe / MoveNet arm landmark indices
const MP = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const MN17 = { ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };

function validArmLandmark(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function horizontalLineOk(shoulderY: number, wristY: number): boolean {
  const delta = wristY - shoulderY;
  return delta <= PUNCH_MAX_BELOW_SHOULDER && delta >= -PUNCH_MAX_ABOVE_SHOULDER;
}

// --- Lead jab: left extended sideways, right contracted (wrist up). No reference. ---
const LEAD_LEFT_EXTEND_MIN = 0.12;
const LEAD_LEFT_HORIZONTAL_TOL = 0.15;
const LEAD_RIGHT_CONTRACT_MAX = 0.22;
const LEAD_RIGHT_WRIST_UP_TOL = 0.15;

/** Only uses arm landmarks (6 points). Ignores head, torso, legs. */
function leadJabPoseOk(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.lw, idx.rw, idx.le, idx.re)) return false;
  const ls = frame[idx.ls];
  const rs = frame[idx.rs];
  const le = frame[idx.le];
  const re = frame[idx.re];
  const lw = frame[idx.lw];
  const rw = frame[idx.rw];
  if (!validArmLandmark(ls) || !validArmLandmark(rs) || !validArmLandmark(le) || !validArmLandmark(re) || !validArmLandmark(lw) || !validArmLandmark(rw)) return false;
  const leftDist = Math.sqrt((lw.x - ls.x) ** 2 + (lw.y - ls.y) ** 2);
  const rightDist = Math.sqrt((rw.x - rs.x) ** 2 + (rw.y - rs.y) ** 2);
  const leftHorizontal = horizontalLineOk(ls.y, lw.y) && Math.abs(lw.y - ls.y) <= LEAD_LEFT_HORIZONTAL_TOL;
  const rightWristUp = rw.y <= re.y + LEAD_RIGHT_WRIST_UP_TOL;
  return (
    leftDist >= LEAD_LEFT_EXTEND_MIN &&
    leftHorizontal &&
    rightDist <= LEAD_RIGHT_CONTRACT_MAX &&
    rightWristUp
  );
}

/** Lead jab: correct rep = left extended straight sideways + right contracted (wrist up). No reference. */
export function createLeadJabRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'holding' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let rightFacingBadUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      phase = 'idle';
      segment = [];
      return buildFacingRightBadRep(frame, 'lead-jab-facing-right-bad-rep');
    }

    if (phase === 'cooldown') {
      if (now >= cooldownUntil) phase = 'idle';
      return { done: false };
    }
    if (phase === 'idle') {
      if (leadJabPoseOk(frame)) {
        phase = 'holding';
        segment = [frame];
      }
      return { done: false };
    }
    if (phase === 'holding') {
      segment.push(frame);
      if (!leadJabPoseOk(frame)) {
        phase = 'idle';
        segment = [];
        return { done: false };
      }
      if (segment.length >= LEAD_JAB_MIN_FRAMES) {
        const out = [...segment];
        segment = [];
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        return { done: true, segment: out };
      }
      return { done: false };
    }
    return { done: false };
  };
}

// --- Orthodox jab: user's LEFT extends (MediaPipe right), user's RIGHT in guard (MediaPipe left). ---
type OrthodoxState = 'idle' | 'extended' | 'cooldown';

const ORTHODOX_PUNCH_EXTEND_MIN = 0.25;
const ORTHODOX_PUNCH_RETRACT_MAX = 0.18;
const ORTHODOX_GUARD_MAX = 0.22;
const ORTHODOX_GUARD_WRIST_UP_TOL = 0.12;
const ORTHODOX_MIN_REP_FRAMES = 5;

function leftExtension(frame: PoseFrame): number | null {
  const d = armExtensionDistances(frame);
  return d ? d.left : null;
}

function rightExtension(frame: PoseFrame): number | null {
  const d = armExtensionDistances(frame);
  return d ? d.right : null;
}

/** User's right hand (guard) = MediaPipe LEFT: contracted and wrist up. Indices 11,13,15. */
function leftHandInGuard(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.lw, idx.le, idx.ls)) return false;
  const ls = frame[idx.ls];
  const le = frame[idx.le];
  const lw = frame[idx.lw];
  if (!validArmLandmark(ls) || !validArmLandmark(le) || !validArmLandmark(lw)) return false;
  const leftDist = Math.sqrt((lw.x - ls.x) ** 2 + (lw.y - ls.y) ** 2);
  const wristUp = lw.y <= le.y + ORTHODOX_GUARD_WRIST_UP_TOL;
  return leftDist <= ORTHODOX_GUARD_MAX && wristUp;
}

/** Orthodox jab: rep = user's LEFT extends = MediaPipe RIGHT extends; user's RIGHT in guard = MediaPipe LEFT in guard. */
export function createOrthodoxJabRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: OrthodoxState = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasRetractedSinceRep = false;
  let rightFacingBadUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      phase = 'idle';
      segment = [];
      hasRetractedSinceRep = false;
      return buildFacingRightBadRep(frame, 'orthodox-jab-facing-right-bad-rep');
    }

    if (phase === 'cooldown') {
      const punch = rightExtension(frame); // user's left = MediaPipe right
      if (punch != null && punch < ORTHODOX_PUNCH_RETRACT_MAX) hasRetractedSinceRep = true;
      if (now >= cooldownUntil && hasRetractedSinceRep) phase = 'idle';
      return { done: false };
    }

    const punch = rightExtension(frame);  // user's left hand = punching = MediaPipe right
    const guard = leftExtension(frame);   // user's right hand = guard = MediaPipe left
    if (punch == null) return { done: false };

    if (phase === 'idle') {
      if (punch < ORTHODOX_PUNCH_RETRACT_MAX) hasRetractedSinceRep = true;
      if (
        hasRetractedSinceRep &&
        punch > ORTHODOX_PUNCH_EXTEND_MIN &&
        (guard == null || guard <= ORTHODOX_GUARD_MAX) &&
        leftHandInGuard(frame) &&
        punchingArmLineOk(frame)
      ) {
        phase = 'extended';
        segment = [frame];
      }
      return { done: false };
    }
    if (phase === 'extended') {
      segment.push(frame);
      if (
        punch < ORTHODOX_PUNCH_RETRACT_MAX ||
        (guard != null && guard > ORTHODOX_GUARD_MAX) ||
        !leftHandInGuard(frame) ||
        !punchingArmLineOk(frame)
      ) {
        phase = 'idle';
        segment = [];
        return { done: false };
      }
      if (segment.length >= ORTHODOX_MIN_REP_FRAMES) {
        const out = [...segment];
        segment = [];
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasRetractedSinceRep = false;
        return { done: true, segment: out };
      }
      return { done: false };
    }
    return { done: false };
  };
}

/** User's left punching arm (MediaPipe RIGHT) should stay roughly horizontal (lenient). */
function punchingArmLineOk(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.rs, idx.rw)) return false;
  const rs = frame[idx.rs];
  const rw = frame[idx.rw];
  if (!validArmLandmark(rs) || !validArmLandmark(rw)) return false;
  return horizontalLineOk(rs.y, rw.y);
}

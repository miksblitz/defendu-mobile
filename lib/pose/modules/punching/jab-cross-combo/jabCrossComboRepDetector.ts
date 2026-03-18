import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { createLeadJabRepDetector, createOrthodoxJabRepDetector } from '../jab';
import { createCrossJabRepDetector } from '../cross';

const COMBO_TIMEOUT_MS = 4000;
const COMBO_COOLDOWN_MS = 900;
const COMBO_SIDEWAYS_TOL = 0.2;

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
  const CROSS_MIN_REP_FRAMES = 5;
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
    if (!isPunchSideways(frame, 'left')) {
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
        phase = 'extended';
        segment = [frame];
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
    if (segment.length >= CROSS_MIN_REP_FRAMES) {
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

  // Prefer lead-jab detection (matches "lead jab" labeling/data), but keep orthodox as fallback
  // so users with slightly different form still progress the combo.
  let leadJabTick = createLeadJabRepDetector();
  let orthodoxJabTick = createOrthodoxJabRepDetector();
  let crossTick = createCrossJabRepDetector();

  let jabSegment: PoseFrame[] | null = null;
  let crossDeadlineMs = 0;
  let cooldownUntilMs = 0;

  function resetToNeedJab() {
    phase = 'need_jab';
    leadJabTick = createLeadJabRepDetector();
    orthodoxJabTick = createOrthodoxJabRepDetector();
    crossTick = createCrossJabRepDetector();
    jabSegment = null;
    crossDeadlineMs = 0;
    cooldownUntilMs = 0;
  }

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      if (now >= cooldownUntilMs) resetToNeedJab();
      return { done: false };
    }

    if (phase === 'need_jab') {
      const leadRes = leadJabTick(frame, now);
      const orthodoxRes = leadRes.done ? ({ done: false } as const) : orthodoxJabTick(frame, now);

      const jabRes = leadRes.done ? leadRes : orthodoxRes;

      if (jabRes.done) {
        // Jab punching arm = user's LEFT = MediaPipe/MoveNet RIGHT side.
        // Require jab to be roughly sideways (slight tilt allowed).
        if (!isPunchSideways(frame, 'right')) {
          // Reset detectors so we don't immediately re-trigger on the same held pose.
          leadJabTick = createLeadJabRepDetector();
          orthodoxJabTick = createOrthodoxJabRepDetector();
          return { done: false };
        }
        jabSegment = jabRes.segment;
        phase = 'need_cross';
        // Use combo-friendly cross detector: doesn't require the jab arm to be back in guard.
        crossTick = createComboCrossRepDetector();
        crossDeadlineMs = now + COMBO_TIMEOUT_MS;
      }
      return { done: false };
    }

    // need_cross
    if (now > crossDeadlineMs) {
      resetToNeedJab();
      return { done: false };
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


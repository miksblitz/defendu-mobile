import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { createLeadJabRepDetector, createOrthodoxJabRepDetector } from '../jab';

const COMBO_TIMEOUT_MS = 4000;
const COMBO_COOLDOWN_MS = 900;
const COMBO_SIDEWAYS_TOL = 0.24;

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

const MP = { ls: 11, lw: 15 };
const MN17 = { ls: 5, lw: 9 };

function validArmLandmark(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
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

const UPPERCUT_LIFT_EXTEND_MIN = 0.028;
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

    if (phase === 'cooldown') {
      if (lift != null && lift < UPPERCUT_LIFT_RETRACT_MAX) sawRearHandLow = true;
      if (now >= cooldownUntil && sawRearHandLow) phase = 'idle';
      return { done: false };
    }

    if (lift == null) return { done: false };

    if (phase === 'idle') {
      if (lift < UPPERCUT_LIFT_RETRACT_MAX) sawRearHandLow = true;
      if (sawRearHandLow && lift > UPPERCUT_LIFT_EXTEND_MIN) {
        phase = 'rising';
        segment = [frame];
      }
      return { done: false };
    }

    if (phase === 'rising') {
      segment.push(frame);
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

  let leadJabTick = createLeadJabRepDetector();
  let orthodoxJabTick = createOrthodoxJabRepDetector();
  let uppercutTick = createComboRearUppercutRepDetector();

  let jabSegment: PoseFrame[] | null = null;
  let uppercutDeadlineMs = 0;
  let cooldownUntilMs = 0;

  function resetToNeedJab() {
    phase = 'need_jab';
    leadJabTick = createLeadJabRepDetector();
    orthodoxJabTick = createOrthodoxJabRepDetector();
    uppercutTick = createComboRearUppercutRepDetector();
    jabSegment = null;
    uppercutDeadlineMs = 0;
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
        if (!isPunchSideways(frame, 'right')) {
          leadJabTick = createLeadJabRepDetector();
          orthodoxJabTick = createOrthodoxJabRepDetector();
          return { done: false };
        }
        jabSegment = jabRes.segment;
        phase = 'need_uppercut';
        uppercutTick = createComboRearUppercutRepDetector();
        uppercutDeadlineMs = now + COMBO_TIMEOUT_MS;
      }
      return { done: false };
    }

    if (now > uppercutDeadlineMs) {
      const jab = jabSegment;
      resetToNeedJab();
      return {
        done: true,
        segment: jab && jab.length > 0 ? [...jab] : [],
        forcedBadRep: true,
        feedback: [{
          id: 'combo-timeout-bad-rep-uppercut',
          message: 'Bad Repetition — throw the uppercut right after the jab. Try again.',
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

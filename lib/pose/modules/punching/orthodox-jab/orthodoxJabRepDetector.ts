import type { PoseFrame, PoseFeedbackItem } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 1000;
const ORTHODOX_PUNCH_EXTEND_MIN = 0.25;
const ORTHODOX_PUNCH_RETRACT_MAX = 0.18;
const ORTHODOX_GUARD_MAX = 0.22;
const ORTHODOX_GUARD_WRIST_UP_TOL = 0.12;
const ORTHODOX_MIN_REP_FRAMES = 5;
const WRONG_HAND_EXTEND_MIN = 0.23;
const WRONG_HAND_MIN_STREAK = 2;

// Lenient horizontal requirement for jab line.
const ORTHODOX_JAB_LINE_TOL = 0.2;
const BAD_LINE_MIN_STREAK = 3;

const MP = { ls: 11, le: 13, lw: 15, rs: 12, rw: 16 };
const MN17 = { ls: 5, le: 7, lw: 9, rs: 6, rw: 10 };

function validArmLandmark(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function leftExtension(frame: PoseFrame): number | null {
  const d = armExtensionDistances(frame);
  return d ? d.left : null;
}

function rightExtension(frame: PoseFrame): number | null {
  const d = armExtensionDistances(frame);
  return d ? d.right : null;
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
  const wristUp = lw.y <= le.y + ORTHODOX_GUARD_WRIST_UP_TOL;
  return leftDist <= ORTHODOX_GUARD_MAX && wristUp;
}

/** User's left punching arm (MediaPipe RIGHT) should stay roughly horizontal (lenient). */
function punchingArmLineOk(frame: PoseFrame): boolean {
  const idx = frame.length > 17 ? MP : frame.length >= 11 ? MN17 : null;
  if (!idx || frame.length <= Math.max(idx.rs, idx.rw)) return false;
  const rs = frame[idx.rs];
  const rw = frame[idx.rw];
  if (!validArmLandmark(rs) || !validArmLandmark(rw)) return false;
  return Math.abs(rw.y - rs.y) <= ORTHODOX_JAB_LINE_TOL;
}

function badLineFeedback(): PoseFeedbackItem[] {
  return [{
    id: 'jab-line-bad-rep',
    message: 'Bad Repetition — keep the punching arm more horizontal (not too high or too low).',
    severity: 'error',
    phase: 'impact',
  }];
}

function wrongHandFeedback(): PoseFeedbackItem[] {
  return [{
    id: 'jab-wrong-hand-bad-rep',
    message: 'Bad Repetition — wrong hand. For orthodox jab, punch with your left hand.',
    severity: 'error',
    phase: 'impact',
  }];
}

export function createOrthodoxJabRepDetectorWithBadRep(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'extended' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasRetractedSinceRep = false;
  let badLineStreak = 0;
  let wrongHandStreak = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      const punch = rightExtension(frame); // user's left = MediaPipe right
      if (punch != null && punch < ORTHODOX_PUNCH_RETRACT_MAX) hasRetractedSinceRep = true;
      if (now >= cooldownUntil && hasRetractedSinceRep) phase = 'idle';
      return { done: false };
    }

    const punch = rightExtension(frame); // user's left hand = punching = MediaPipe right
    const guard = leftExtension(frame); // user's right hand = guard = MediaPipe left
    if (punch == null) return { done: false };

    if (phase === 'idle') {
      if (punch < ORTHODOX_PUNCH_RETRACT_MAX) hasRetractedSinceRep = true;
      const wrongPunching = guard != null && guard > WRONG_HAND_EXTEND_MIN && punch < ORTHODOX_PUNCH_EXTEND_MIN;
      wrongHandStreak = wrongPunching ? wrongHandStreak + 1 : 0;
      if (hasRetractedSinceRep && wrongHandStreak >= WRONG_HAND_MIN_STREAK) {
        const out = [frame];
        wrongHandStreak = 0;
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasRetractedSinceRep = false;
        return { done: true, segment: out, forcedBadRep: true, feedback: wrongHandFeedback() };
      }
      if (
        hasRetractedSinceRep &&
        punch > ORTHODOX_PUNCH_EXTEND_MIN &&
        (guard == null || guard <= ORTHODOX_GUARD_MAX) &&
        leftHandInGuard(frame)
      ) {
        phase = 'extended';
        segment = [frame];
        badLineStreak = punchingArmLineOk(frame) ? 0 : 1;
      }
      return { done: false };
    }

    segment.push(frame);

    const isExtendedAndBadLine = punch >= ORTHODOX_PUNCH_EXTEND_MIN && !punchingArmLineOk(frame);
    badLineStreak = isExtendedAndBadLine ? badLineStreak + 1 : 0;

    if (badLineStreak >= BAD_LINE_MIN_STREAK) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      hasRetractedSinceRep = false;
      badLineStreak = 0;
      return { done: true, segment: out, forcedBadRep: true, feedback: badLineFeedback() };
    }

    const wrongPunching = guard != null && guard > WRONG_HAND_EXTEND_MIN && punch < ORTHODOX_PUNCH_EXTEND_MIN;
    wrongHandStreak = wrongPunching ? wrongHandStreak + 1 : 0;
    if (wrongHandStreak >= WRONG_HAND_MIN_STREAK) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      hasRetractedSinceRep = false;
      badLineStreak = 0;
      wrongHandStreak = 0;
      return { done: true, segment: out, forcedBadRep: true, feedback: wrongHandFeedback() };
    }

    if (
      punch < ORTHODOX_PUNCH_RETRACT_MAX ||
      (guard != null && guard > ORTHODOX_GUARD_MAX) ||
      !leftHandInGuard(frame)
    ) {
      phase = 'idle';
      segment = [];
      badLineStreak = 0;
      wrongHandStreak = 0;
      return { done: false };
    }

    if (segment.length >= ORTHODOX_MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      hasRetractedSinceRep = false;
      badLineStreak = 0;
      wrongHandStreak = 0;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}


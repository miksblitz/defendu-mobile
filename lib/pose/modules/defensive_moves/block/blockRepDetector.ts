/**
 * Block rep detector: counts a rep when user transitions from neutral/normal stance
 * into a valid two-hand guard (blocking) and holds briefly.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 900;
const MIN_REP_FRAMES = 5;
const GUARD_MAX_EXTENSION = 0.24;
const GUARD_WRIST_UP_TOL = 0.12;
/**
 * Max euclidean distance from fist (wrist) to nose. Tightened from 0.34 → 0.18
 * so the fist must actually be at the face, not anywhere within a third of the
 * frame.
 */
const FACE_FIST_MAX_DIST = 0.18;
/**
 * Max distance the fist may sit ABOVE the nose (wrist.y < nose.y). Keeps fists
 * from passing the check by being raised over the head/forehead.
 */
const FACE_FIST_MAX_ABOVE_NOSE = 0.05;
/**
 * Max distance the fist may sit BELOW the nose (wrist.y > nose.y). Roughly
 * chin/jawline height — anything lower (chest, neck) fails so the user must
 * actually have the fist at lips/chin level.
 */
const FACE_FIST_MAX_BELOW_NOSE = 0.18;
const FOREARM_MIN_VERTICAL_DY = 0.05;
const FOREARM_MAX_SIDEWAYS_RATIO = 0.5;
/**
 * Looser horizontal/vertical ratio cap for the inward-angled "/.\" guard shape
 * where forearms angle inward toward the centerline (wrist closer to face than
 * elbow). Used in the inward-angled exception below.
 */
const FOREARM_INWARD_MAX_SIDEWAYS_RATIO = 1.5;
const RESET_MIN_EXTENSION = 0.2;

const MP = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
const MN17 = { nose: 0, ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function getArmIndices(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > 17) return MP;
  if (frame.length >= 11) return MN17;
  return null;
}

/**
 * Returns true when the fist (wrist) is actually AT the face — within a tight
 * radius of the nose AND within a vertical band roughly spanning forehead-to-
 * chin. This enforces "fist touching lips/chin" rather than just "fist somewhere
 * generally near the head".
 */
function isFistAtFace(
  wrist: { x: number; y: number },
  nose: { x: number; y: number }
): boolean {
  if (dist(wrist, nose) > FACE_FIST_MAX_DIST) return false;
  const wristAboveNose = nose.y - wrist.y;
  if (wristAboveNose > FACE_FIST_MAX_ABOVE_NOSE) return false;
  const wristBelowNose = wrist.y - nose.y;
  if (wristBelowNose > FACE_FIST_MAX_BELOW_NOSE) return false;
  return true;
}

/**
 * Inward-angled forearm acceptance for the "/.\" guard shape.
 *
 * Returns true when:
 *   - the forearm has a meaningful vertical extent (dy >= FOREARM_MIN_VERTICAL_DY),
 *   - the horizontal offset is within a looser cap (dx <= dy * 1.5), AND
 *   - the wrist is HORIZONTALLY INWARD of the elbow — i.e. closer to the
 *     nose's x than the elbow is. This is the slash that points toward the
 *     centerline (left arm "/" with wrist near face / elbow out, right arm "\"
 *     with wrist near face / elbow out).
 *
 * Reps that pass this check still also need every other block rule (contracted
 * guard, wrist up, hand near face) — only the strict "vertical forearm" rule is
 * being relaxed for this specific inward-angled style.
 */
function isForearmInwardAngled(
  elbow: { x: number; y: number },
  wrist: { x: number; y: number },
  nose: { x: number; y: number }
): boolean {
  const dy = Math.abs(wrist.y - elbow.y);
  const dx = Math.abs(wrist.x - elbow.x);
  if (dy < FOREARM_MIN_VERTICAL_DY) return false;
  if (dx > dy * FOREARM_INWARD_MAX_SIDEWAYS_RATIO) return false;
  return Math.abs(wrist.x - nose.x) < Math.abs(elbow.x - nose.x);
}

function isBlockingFrame(frame: PoseFrame): boolean {
  const d = armExtensionDistances(frame);
  const idx = getArmIndices(frame);
  if (!d || !idx || frame.length <= Math.max(idx.nose, idx.rw, idx.re, idx.lw, idx.le)) return false;

  const nose = frame[idx.nose];
  const le = frame[idx.le];
  const re = frame[idx.re];
  const lw = frame[idx.lw];
  const rw = frame[idx.rw];
  if (!validPoint(nose) || !validPoint(le) || !validPoint(re) || !validPoint(lw) || !validPoint(rw)) return false;

  const leftGuard = d.left <= GUARD_MAX_EXTENSION;
  const rightGuard = d.right <= GUARD_MAX_EXTENSION;
  const leftWristUp = lw.y <= le.y + GUARD_WRIST_UP_TOL;
  const rightWristUp = rw.y <= re.y + GUARD_WRIST_UP_TOL;
  const leftNearFace = isFistAtFace(lw, nose);
  const rightNearFace = isFistAtFace(rw, nose);

  const leftForearmDx = Math.abs(lw.x - le.x);
  const rightForearmDx = Math.abs(rw.x - re.x);
  const leftForearmDy = Math.abs(lw.y - le.y);
  const rightForearmDy = Math.abs(rw.y - re.y);
  const leftForearmVertical =
    leftForearmDy >= FOREARM_MIN_VERTICAL_DY &&
    leftForearmDx <= leftForearmDy * FOREARM_MAX_SIDEWAYS_RATIO;
  const rightForearmVertical =
    rightForearmDy >= FOREARM_MIN_VERTICAL_DY &&
    rightForearmDx <= rightForearmDy * FOREARM_MAX_SIDEWAYS_RATIO;
  // Inward-angled "/.\" exception — accept reps where the forearms angle
  // inward toward the centerline instead of being strictly vertical.
  const leftForearmShapeOk = leftForearmVertical || isForearmInwardAngled(le, lw, nose);
  const rightForearmShapeOk = rightForearmVertical || isForearmInwardAngled(re, rw, nose);

  return (
    leftGuard &&
    rightGuard &&
    leftWristUp &&
    rightWristUp &&
    leftNearFace &&
    rightNearFace &&
    leftForearmShapeOk &&
    rightForearmShapeOk
  );
}

function isNeutralFrame(frame: PoseFrame): boolean {
  const d = armExtensionDistances(frame);
  if (!d) return false;
  // Neutral/normal stance should show at least one arm more relaxed/open.
  return d.left >= RESET_MIN_EXTENSION || d.right >= RESET_MIN_EXTENSION;
}

export function createBlockRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'blocking' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasResetSinceRep = true;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      if (isNeutralFrame(frame)) hasResetSinceRep = true;
      if (now >= cooldownUntil && hasResetSinceRep) phase = 'idle';
      return { done: false };
    }

    const blocking = isBlockingFrame(frame);

    if (phase === 'idle') {
      if (isNeutralFrame(frame)) hasResetSinceRep = true;
      if (hasResetSinceRep && blocking) {
        phase = 'blocking';
        segment = [frame];
      }
      return { done: false };
    }

    if (phase === 'blocking') {
      if (!blocking) {
        phase = 'idle';
        segment = [];
        return { done: false };
      }
      segment.push(frame);
      if (segment.length >= MIN_REP_FRAMES) {
        const out = [...segment];
        segment = [];
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        hasResetSinceRep = false;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    return { done: false };
  };
}

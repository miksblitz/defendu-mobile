/**
 * Parry rep detector:
 * - Active parry arm can be constrained by side.
 * - Requires a neutral reset before each rep.
 * - Includes cooldown after a completed perfect rep.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

// Same concept and structure as the RIGHT-parry pipeline (the "perfect"
// reference): straightforward extension + lateral + wrist-above-shoulder
// rules, no shoulder-width adaptive threshold, no L-shape exception.
//
// Threshold tweaks vs RIGHT (so LEFT FEELS the same to non-dominant arms):
//   PARRY_MIN_LATERAL: right=0.10  → left=0.085 (~15% easier)
//   WRIST_ABOVE_SHOULDER_MIN: right=0.04 → left=0.025 (~37% easier)
// PARRY_MIN_EXTENSION is kept identical to the right so a real reach-out is
// still required.
const COOLDOWN_MS = 900;
const MIN_REP_FRAMES = 4;
const NEUTRAL_MAX_EXTENSION = 0.23;
const PARRY_MIN_EXTENSION = 0.26;
const PARRY_MIN_LATERAL = 0.085;
const WRIST_ABOVE_SHOULDER_MIN = 0.025;

// ---------------------------------------------------------------------------
// Far-distance fallback (additive — does NOT replace the close-distance rules
// above). At ~2–3 m from the camera the body fills less of the frame, so the
// absolute thresholds shrink proportionally. We use shoulder-to-shoulder
// distance as a body-size proxy and scale the thresholds by it.
// ---------------------------------------------------------------------------
const REFERENCE_BODY_SCALE = 0.25;
const FAR_DISTANCE_BODY_SCALE_MAX = 0.18;
const MIN_BODY_SCALE_FOR_FAR = 0.06;

const MP = {
  nose: 0, leftEye: 2, rightEye: 5,
  ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16,
};
const MN17 = {
  nose: 0, leftEye: 1, rightEye: 2,
  ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10,
};

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function getIdx(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > 17) return MP;
  if (frame.length >= 11) return MN17;
  return null;
}

function isParryArm(frame: PoseFrame, side: 'left' | 'right'): boolean {
  const d = armExtensionDistances(frame);
  const idx = getIdx(frame);
  if (!d || !idx || frame.length <= Math.max(idx.rw, idx.rs)) return false;

  const shoulder = side === 'left' ? frame[idx.ls] : frame[idx.rs];
  const wrist = side === 'left' ? frame[idx.lw] : frame[idx.rw];
  const otherShoulder = side === 'left' ? frame[idx.rs] : frame[idx.ls];
  const ext = side === 'left' ? d.left : d.right;
  if (!validPoint(shoulder) || !validPoint(wrist)) return false;

  const lateral = Math.abs(wrist.x - shoulder.x);
  const wristAbove = shoulder.y - wrist.y;
  const standardOk =
    ext >= PARRY_MIN_EXTENSION &&
    lateral >= PARRY_MIN_LATERAL &&
    wristAbove >= WRIST_ABOVE_SHOULDER_MIN;
  if (standardOk) return true;

  // Far-distance fallback: when the user is ~2–3 m away, body fills less of
  // the frame, so scale the thresholds by their apparent shoulder-width.
  if (validPoint(otherShoulder)) {
    const bodyScale = Math.hypot(shoulder.x - otherShoulder!.x, shoulder.y - otherShoulder!.y);
    if (bodyScale <= FAR_DISTANCE_BODY_SCALE_MAX && bodyScale >= MIN_BODY_SCALE_FOR_FAR) {
      const scale = bodyScale / REFERENCE_BODY_SCALE;
      if (
        ext >= PARRY_MIN_EXTENSION * scale &&
        lateral >= PARRY_MIN_LATERAL * scale &&
        wristAbove >= WRIST_ABOVE_SHOULDER_MIN * scale
      ) return true;
    }
  }

  // Forehead/eye-line exception — accept the parry as a perfect rep whenever
  // the parry arm's WRIST or FOREARM is up at the forehead (at or above the
  // eye line). The forearm is "at the forehead" when either the wrist or the
  // elbow on that side sits at/above the eye line, which means the elbow→
  // wrist segment is covering the forehead area.
  //
  // The expectedSide routing in the rep detector below still turns a parry
  // performed with the wrong arm into a "WRONG ARM!" bad rep. The neutral
  // reset between reps prevents a static high guard on the off-arm from
  // racking up reps on its own.
  if (isWristOrForearmAtForehead(frame, side)) return true;

  return false;
}

/**
 * Returns true when the parry arm's WRIST or FOREARM is at or above the
 * user's eye line — i.e. the hand or the forearm is up at forehead level.
 * The forearm covers the forehead when either endpoint (wrist or elbow) is
 * at/above the eye line, since the segment between them must then intersect
 * the forehead area. Eye position is averaged from the two eye landmarks,
 * falling back to a slightly larger nose offset if the eyes aren't tracked.
 */
function isWristOrForearmAtForehead(frame: PoseFrame, side: 'left' | 'right'): boolean {
  const idx = getIdx(frame);
  if (!idx) return false;

  const eyeY = getEyeLineY(frame, idx);
  if (eyeY == null) return false;

  const wrist = side === 'left' ? frame[idx.lw] : frame[idx.rw];
  if (validPoint(wrist) && wrist.y <= eyeY) return true;

  const elbow = side === 'left' ? frame[idx.le] : frame[idx.re];
  if (validPoint(elbow) && elbow.y <= eyeY) return true;

  return false;
}

function getEyeLineY(frame: PoseFrame, idx: typeof MP | typeof MN17): number | null {
  const leftEye = frame[idx.leftEye];
  const rightEye = frame[idx.rightEye];
  const ys: number[] = [];
  if (validPoint(leftEye)) ys.push(leftEye.y);
  if (validPoint(rightEye)) ys.push(rightEye.y);
  if (ys.length > 0) return ys.reduce((a, b) => a + b, 0) / ys.length;
  // Fallback: eyes sit ~0.06 above the nose tip in normalized image coords.
  const nose = frame[idx.nose];
  if (validPoint(nose)) return nose.y - 0.06;
  return null;
}

function detectParrySide(frame: PoseFrame): 'left' | 'right' | null {
  const left = isParryArm(frame, 'left');
  const right = isParryArm(frame, 'right');
  // Mirror the RIGHT-parry module's tiebreaker, but prefer LEFT here. When
  // both arms qualify (e.g. a guard hand on the other side also passes), the
  // expected side wins — same trick the right module uses to feel "perfect".
  // The wrong-arm path still fires when ONLY the right side qualifies, so
  // doing the move with the wrong arm is still caught.
  if (left && right) return 'left';
  if (left) return 'left';
  if (right) return 'right';
  return null;
}

function isNeutral(frame: PoseFrame): boolean {
  const d = armExtensionDistances(frame);
  if (!d) return false;
  return d.left <= NEUTRAL_MAX_EXTENSION && d.right <= NEUTRAL_MAX_EXTENSION;
}

function oppositeSide(side: 'left' | 'right'): 'left' | 'right' {
  return side === 'left' ? 'right' : 'left';
}

export function createParryRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  return createParryRepDetectorForSide('either');
}

export function createParryRepDetectorForSide(
  expectedSide: 'left' | 'right' | 'either'
): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'parrying' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let hasNeutralSinceRep = true;
  let activeSide: 'left' | 'right' | null = null;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      if (isNeutral(frame)) hasNeutralSinceRep = true;
      if (now >= cooldownUntil && hasNeutralSinceRep) phase = 'idle';
      return { done: false };
    }

    const side = detectParrySide(frame);

    if (phase === 'idle') {
      if (isNeutral(frame)) hasNeutralSinceRep = true;
      const sideAllowed = side != null && (expectedSide === 'either' || side === expectedSide);
      if (hasNeutralSinceRep && sideAllowed) {
        phase = 'parrying';
        activeSide = side!;
        segment = [frame];
      } else if (
        hasNeutralSinceRep &&
        side != null &&
        expectedSide !== 'either' &&
        side === oppositeSide(expectedSide)
      ) {
        return {
          done: true,
          segment: [frame],
          forcedBadRep: true,
          feedback: [{
            id: 'wrong-parry-arm',
            message: 'WRONG ARM!',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }
      return { done: false };
    }

    if (side == null) {
      phase = 'idle';
      activeSide = null;
      segment = [];
      return { done: false };
    }

    if (side !== activeSide) {
      const badSegment = [...segment, frame];
      phase = 'idle';
      activeSide = null;
      segment = [];
      if (expectedSide !== 'either' && side === oppositeSide(expectedSide) && badSegment.length > 0) {
        return {
          done: true,
          segment: badSegment,
          forcedBadRep: true,
          feedback: [{
            id: 'wrong-parry-arm',
            message: 'WRONG ARM!',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      activeSide = null;
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      hasNeutralSinceRep = false;
      return { done: true, segment: out };
    }
    return { done: false };
  };
}

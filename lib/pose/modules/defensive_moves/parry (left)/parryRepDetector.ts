/**
 * Parry rep detector (parry-LEFT module wiring lives in this folder).
 * - Active parry arm can be constrained by side.
 * - Requires a neutral reset before each rep.
 * - Includes cooldown after a completed perfect rep.
 *
 * Forehead/forearm rule:
 *   If the wrist OR the forearm (elbow→wrist) is at the user's forehead — i.e.
 *   either the wrist or the elbow on a side is at/above the eye line — that
 *   side qualifies as a parry, bypassing the extension/lateral/wrist-above-
 *   shoulder thresholds. The expected-side restriction is still enforced, so
 *   a forehead parry on the wrong arm is forced into a "WRONG ARM!" bad rep.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { armExtensionDistances } from '../../../phaseDetection';

const COOLDOWN_MS = 900;
const MIN_REP_FRAMES = 4;
const NEUTRAL_MAX_EXTENSION = 0.23;
const PARRY_MIN_EXTENSION = 0.26;
const PARRY_MIN_LATERAL = 0.1;
const WRIST_ABOVE_SHOULDER_MIN = 0.04;

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

/**
 * True when the parry arm's WRIST or FOREARM is at/above the eye line on the
 * given side. The forearm is "at the forehead" whenever either endpoint
 * (wrist or elbow) is at/above the eye line — the elbow→wrist segment then
 * intersects the forehead area.
 */
export function isWristOrForearmAtForehead(frame: PoseFrame, side: 'left' | 'right'): boolean {
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

function isParryArm(frame: PoseFrame, side: 'left' | 'right'): boolean {
  // Forehead/forearm rule first: if the wrist or forearm is up at the eye
  // line on this side, it qualifies as a perfect parry no matter what the
  // distance/extension/lateral checks say.
  if (isWristOrForearmAtForehead(frame, side)) return true;

  const d = armExtensionDistances(frame);
  const idx = getIdx(frame);
  if (!d || !idx || frame.length <= Math.max(idx.rw, idx.rs)) return false;

  const shoulder = side === 'left' ? frame[idx.ls] : frame[idx.rs];
  const wrist = side === 'left' ? frame[idx.lw] : frame[idx.rw];
  const ext = side === 'left' ? d.left : d.right;
  if (!validPoint(shoulder) || !validPoint(wrist)) return false;

  const lateral = Math.abs(wrist.x - shoulder.x);
  const wristAbove = shoulder.y - wrist.y;
  return ext >= PARRY_MIN_EXTENSION && lateral >= PARRY_MIN_LATERAL && wristAbove >= WRIST_ABOVE_SHOULDER_MIN;
}

function detectParrySide(frame: PoseFrame): 'left' | 'right' | null {
  const left = isParryArm(frame, 'left');
  const right = isParryArm(frame, 'right');

  // Tiebreaker prefers LEFT (this module is parry-LEFT). When both arms
  // qualify (e.g. a high two-handed guard), the user's intent on this drill
  // is the LEFT parry, so left wins. If only the right arm qualifies, side
  // becomes 'right' so the wrong-arm path can fire.
  const leftForehead = left && isWristOrForearmAtForehead(frame, 'left');
  const rightForehead = right && isWristOrForearmAtForehead(frame, 'right');
  if (left && right) {
    if (rightForehead && !leftForehead) return 'right';
    return 'left';
  }
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

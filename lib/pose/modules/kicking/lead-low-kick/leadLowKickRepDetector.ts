/**
 * Lead low kick — rep detector.
 *
 * Strike pose and “feet neutral” never occur on the same frame: during extension the kicking
 * ankle stays well above the support ankle. Idle entry uses either a rising edge on strike
 * or a transition from reset, and cooldown ends on a timer only (see jab pattern).
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';
import {
  getIdx,
  inLeadLowKickStrikePose,
  inRearLowKickStrikePose,
  leadLowKickResetPose,
  midHipY,
  rightKneeInteriorAngleDeg,
} from './leadLowKickGeometry';
import { inLowLeadStrikePose } from '../../knee_strikes/low-lead-knee-strike/lowLeadKneeStrikeGeometry';

const COOLDOWN_MS = 700;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
const MIN_REP_FRAMES = 3;
const LEAD_KICK_SAME_SIDE_CENTERLINE_MIN = 0.01;
const HIGH_KNEE_ABOVE_HIP_MIN = 0.02;
const LEAD_LOW_KICK_MIN_STRAIGHT_KNEE_DEG = 138;

function leadKickSameSide(frame: PoseFrame, idx: ReturnType<typeof getIdx>): boolean {
  if (!idx) return false;
  const lh = frame[idx.lh];
  const rh = frame[idx.rh];
  const ra = frame[idx.ra]; // lead low kick uses right-chain ankle
  if (!lh || !rh || !ra) return false;
  if (![lh.x, rh.x, ra.x].every(Number.isFinite)) return false;

  const bodyMidX = (lh.x + rh.x) / 2;
  const sameSideSign = Math.sign(rh.x - lh.x) || 1;
  // Lead kick must remain on its own side (no across-body kick).
  return (ra.x - bodyMidX) * sameSideSign >= LEAD_KICK_SAME_SIDE_CENTERLINE_MIN;
}

export function createLeadLowKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'striking' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;
  let prevStrike = false;
  let prevReset = false;
  let rightFacingBadUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      phase = 'idle';
      segment = [];
      prevStrike = false;
      prevReset = false;
      return buildFacingRightBadRep(frame, 'lead-low-kick-facing-right-bad-rep');
    }

    const idx = getIdx(frame);
    if (!idx) return { done: false };

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      phase = 'idle';
      segment = [];
      prevStrike = inLeadLowKickStrikePose(frame, idx);
      prevReset = leadLowKickResetPose(frame, idx);
      return { done: false };
    }

    const kickShape = inLeadLowKickStrikePose(frame, idx);
    const sameSide = leadKickSameSide(frame, idx);
    const kneeAngle = rightKneeInteriorAngleDeg(frame, idx);
    const straightEnough = kneeAngle != null && kneeAngle >= LEAD_LOW_KICK_MIN_STRAIGHT_KNEE_DEG;
    const strike = kickShape && sameSide && straightEnough;
    const oppositeLegStrike = inRearLowKickStrikePose(frame, idx);
    const lowLeadKneeLike = inLowLeadStrikePose(frame, idx);
    const line = midHipY(frame, idx);
    const rk = frame[idx.rk];
    const highLeadKneeLike = line != null && rk != null && Number.isFinite(rk.y) && rk.y < line - HIGH_KNEE_ABOVE_HIP_MIN;
    const bentKickAttempt = kickShape && sameSide && !straightEnough;
    const reset = leadLowKickResetPose(frame, idx);

    // Ignore striking-leg knee-like/bent-kick attempts in this module:
    // do not score as bad rep and do not count as a kick rep.
    if (lowLeadKneeLike || highLeadKneeLike || bentKickAttempt) {
      phase = 'idle';
      segment = [];
      prevStrike = false;
      prevReset = reset;
      return { done: false };
    }

    if (oppositeLegStrike && !strike) {
      phase = 'cooldown';
      segment = [];
      cooldownUntil = now + COOLDOWN_MS;
      prevStrike = false;
      prevReset = reset;
      return {
        done: true,
        segment: [frame],
        forcedBadRep: true,
        feedback: [{
          id: 'lead-low-kick-opposite-leg',
          message: 'WRONG LEG!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (phase === 'idle') {
      if (strike && (!prevStrike || prevReset)) {
        phase = 'striking';
        segment = [frame];
      }
      prevStrike = strike;
      prevReset = reset;
      return { done: false };
    }

    if (!strike) {
      phase = 'idle';
      segment = [];
      prevStrike = false;
      prevReset = reset;
      return { done: false };
    }

    segment.push(frame);
    if (segment.length >= MIN_REP_FRAMES) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

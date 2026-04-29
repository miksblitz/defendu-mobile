/**
 * Rear low kick — rep detector (MP left chain / mirrored rear leg; same state machine as lead).
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';
import {
  getIdx,
  inLeadLowKickStrikePose,
  inRearLowKickStrikePose,
  leadLowKickResetPose,
  leftKneeInteriorAngleDeg,
  midHipY,
} from '../lead-low-kick/leadLowKickGeometry';

const COOLDOWN_MS = 700;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
const MIN_REP_FRAMES = 3;
const REAR_KICK_ACROSS_CENTERLINE_MIN = 0.01;
const HIGH_KNEE_ABOVE_HIP_MIN = 0.02;
const REAR_LOW_KICK_MIN_STRAIGHT_KNEE_DEG = 138;

function rearKickAcrossBody(frame: PoseFrame, idx: ReturnType<typeof getIdx>): boolean {
  if (!idx) return false;
  const lh = frame[idx.lh];
  const rh = frame[idx.rh];
  const la = frame[idx.la]; // rear low kick uses left-chain ankle
  if (!lh || !rh || !la) return false;
  if (![lh.x, rh.x, la.x].every(Number.isFinite)) return false;

  const bodyMidX = (lh.x + rh.x) / 2;
  const towardOppositeSign = Math.sign(rh.x - lh.x) || 1;
  // Rear low kick must cross body toward the opposite side.
  return (la.x - bodyMidX) * towardOppositeSign >= REAR_KICK_ACROSS_CENTERLINE_MIN;
}

export function createRearLowKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
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
      return buildFacingRightBadRep(frame, 'rear-low-kick-facing-right-bad-rep');
    }

    const idx = getIdx(frame);
    if (!idx) return { done: false };

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      phase = 'idle';
      segment = [];
      prevStrike = inRearLowKickStrikePose(frame, idx);
      prevReset = leadLowKickResetPose(frame, idx);
      return { done: false };
    }

    const kickShape = inRearLowKickStrikePose(frame, idx);
    const acrossBody = rearKickAcrossBody(frame, idx);
    const kneeAngle = leftKneeInteriorAngleDeg(frame, idx);
    const straightEnough = kneeAngle != null && kneeAngle >= REAR_LOW_KICK_MIN_STRAIGHT_KNEE_DEG;
    const strike = kickShape && acrossBody && straightEnough;
    const bentKickAttempt = kickShape && acrossBody && !straightEnough;
    const leadLowKickLike = inLeadLowKickStrikePose(frame, idx) && !strike;
    const line = midHipY(frame, idx);
    const rk = frame[idx.rk];
    const leadHighKneeLike = line != null && rk != null && Number.isFinite(rk.y) && rk.y < line - HIGH_KNEE_ABOVE_HIP_MIN;
    const reset = leadLowKickResetPose(frame, idx);

    // Ignore bent rear-kick attempts: neither bad rep nor perfect rep.
    if (bentKickAttempt) {
      phase = 'idle';
      segment = [];
      prevStrike = false;
      prevReset = reset;
      return { done: false };
    }

    if (leadLowKickLike) {
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
          id: 'rear-low-kick-opposite-leg',
          message: 'WRONG LEG!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (leadHighKneeLike && !strike) {
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
          id: 'rear-low-kick-lead-high-knee',
          message: 'WRONG MOTION!',
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

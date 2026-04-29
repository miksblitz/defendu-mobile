/**
 * Double low kick — sequential combo of lead low kick then rear low kick.
 *
 * Reuses the working single-module rep detectors as-is so perfect-rep standards stay aligned:
 *   1. wait for lead-low-kick rep (clean, not forced bad).
 *   2. then wait for rear-low-kick rep within COMBO_TIMEOUT_MS.
 *   3. emit combined segment as perfect rep.
 *
 * Forced bad reps from sub-detectors pass through directly; combo state resets after them.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { buildFacingRightBadRep, isFacingRightSide } from '../facingDirection';
import { createLeadLowKickRepDetector } from '../lead-low-kick/leadLowKickRepDetector';
import { createRearLowKickRepDetector } from '../rear-low-kick/rearLowKickRepDetector';
import {
  getIdx,
  inRearLowKickStrikePose,
} from '../lead-low-kick/leadLowKickGeometry';
import {
  getIdx as getLowLeadKneeIdx,
  inLowLeadStrikePose,
} from '../../knee_strikes/low-lead-knee-strike/lowLeadKneeStrikeGeometry';
import {
  getIdx as getLowRearKneeIdx,
  inLowRearStrikePose,
} from '../../knee_strikes/low-rear-knee-strike/lowRearKneeStrikeGeometry';

const COMBO_TIMEOUT_MS = 5000;
const COMBO_COOLDOWN_MS = 800;
const RIGHT_FACING_BAD_COOLDOWN_MS = 250;
const REAR_FALLBACK_MIN_FRAMES = 3;
const REAR_FIRST_BAD_MIN_FRAMES = 2;
const REAR_KICK_ACROSS_CENTERLINE_MIN = 0.01;

type Phase = 'need_lead' | 'need_rear' | 'cooldown';

function anyLowKneeStrikePose(frame: PoseFrame): boolean {
  const leadIdx = getLowLeadKneeIdx(frame);
  const rearIdx = getLowRearKneeIdx(frame);
  const leadKnee = leadIdx ? inLowLeadStrikePose(frame, leadIdx) : false;
  const rearKnee = rearIdx ? inLowRearStrikePose(frame, rearIdx) : false;
  return leadKnee || rearKnee;
}

function rearKickAcrossBody(frame: PoseFrame, idx: ReturnType<typeof getIdx>): boolean {
  if (!idx) return false;
  const lh = frame[idx.lh];
  const rh = frame[idx.rh];
  const la = frame[idx.la];
  if (!lh || !rh || !la) return false;
  if (![lh.x, rh.x, la.x].every(Number.isFinite)) return false;

  const bodyMidX = (lh.x + rh.x) / 2;
  const towardOppositeSign = Math.sign(rh.x - lh.x) || 1;
  return (la.x - bodyMidX) * towardOppositeSign >= REAR_KICK_ACROSS_CENTERLINE_MIN;
}

export function createDoubleLowKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: Phase = 'need_lead';
  let leadTick = createLeadLowKickRepDetector();
  let rearFirstTick = createRearLowKickRepDetector();
  let rearTick: ReturnType<typeof createRearLowKickRepDetector> | null = null;
  let leadSegment: PoseFrame[] | null = null;
  let rearDeadlineMs = 0;
  let cooldownUntilMs = 0;
  let rearFallbackFrames = 0;
  let rearFallbackSegment: PoseFrame[] = [];
  let rearFirstBadFrames = 0;
  let rearFirstBadSegment: PoseFrame[] = [];
  let rightFacingBadUntil = 0;

  function resetToNeedLead() {
    phase = 'need_lead';
    leadTick = createLeadLowKickRepDetector();
    rearFirstTick = createRearLowKickRepDetector();
    rearTick = null;
    leadSegment = null;
    rearDeadlineMs = 0;
    cooldownUntilMs = 0;
    rearFallbackFrames = 0;
    rearFallbackSegment = [];
    rearFirstBadFrames = 0;
    rearFirstBadSegment = [];
  }

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (isFacingRightSide(frame) && now >= rightFacingBadUntil) {
      rightFacingBadUntil = now + RIGHT_FACING_BAD_COOLDOWN_MS;
      resetToNeedLead();
      return buildFacingRightBadRep(frame, 'double-low-kick-facing-right-bad-rep');
    }

    if (phase === 'cooldown') {
      if (now >= cooldownUntilMs) resetToNeedLead();
      return { done: false };
    }

    if (phase === 'need_lead') {
      // Ignore low-knee-strike motion in this module: neither bad rep nor perfect rep.
      if (anyLowKneeStrikePose(frame)) {
        return { done: false };
      }

      const idx = getIdx(frame);
      const rearFirstPoseNow = idx ? (inRearLowKickStrikePose(frame, idx) && rearKickAcrossBody(frame, idx)) : false;
      if (rearFirstPoseNow) {
        rearFirstBadFrames += 1;
        rearFirstBadSegment.push(frame);
      } else {
        rearFirstBadFrames = 0;
        rearFirstBadSegment = [];
      }
      if (rearFirstBadFrames >= REAR_FIRST_BAD_MIN_FRAMES) {
        const badSeg = rearFirstBadSegment.length > 0 ? [...rearFirstBadSegment] : [frame];
        resetToNeedLead();
        return {
          done: true,
          segment: badSeg,
          forcedBadRep: true,
          feedback: [{
            id: 'double-low-kick-wrong-order',
            message: 'WRONG COMBO!',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }

      const rearFirstRes = rearFirstTick(frame, now);
      if (rearFirstRes.done && !('forcedBadRep' in rearFirstRes && rearFirstRes.forcedBadRep)) {
        resetToNeedLead();
        return {
          done: true,
          segment: rearFirstRes.segment,
          forcedBadRep: true,
          feedback: [{
            id: 'double-low-kick-wrong-order',
            message: 'WRONG COMBO!',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }

      const leadRes = leadTick(frame, now);
      if (leadRes.done && 'forcedBadRep' in leadRes && leadRes.forcedBadRep) {
        // In combo mode, ignore sub-detector bad reps and keep waiting for a clean lead rep.
        return { done: false };
      }
      if (leadRes.done) {
        leadSegment = leadRes.segment;
        phase = 'need_rear';
        rearTick = createRearLowKickRepDetector();
        rearDeadlineMs = now + COMBO_TIMEOUT_MS;
        rearFallbackFrames = 0;
        rearFallbackSegment = [];
      }
      return { done: false };
    }

    if (now > rearDeadlineMs) {
      const lead = leadSegment;
      resetToNeedLead();
      return {
        done: true,
        segment: lead && lead.length > 0 ? [...lead] : [],
        forcedBadRep: true,
        feedback: [{
          id: 'combo-timeout-bad-rep-double-low-kick',
          message: 'FINISH COMBO!',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    if (!rearTick) {
      resetToNeedLead();
      return { done: false };
    }

    // Ignore low-knee-strike motion in this module: neither bad rep nor perfect rep.
    if (anyLowKneeStrikePose(frame)) {
      return { done: false };
    }

    const idx = getIdx(frame);
    const rearPoseNow = idx ? inRearLowKickStrikePose(frame, idx) : false;
    if (rearPoseNow) {
      rearFallbackFrames += 1;
      rearFallbackSegment.push(frame);
    } else {
      rearFallbackFrames = 0;
      rearFallbackSegment = [];
    }

    const rearRes = rearTick(frame, now);
    if (rearRes.done && 'forcedBadRep' in rearRes && rearRes.forcedBadRep) {
      // In combo mode, ignore sub-detector bad reps and keep waiting for a clean rear rep.
      return { done: false };
    }
    if (!rearRes.done) {
      if (rearFallbackFrames < REAR_FALLBACK_MIN_FRAMES) return { done: false };
      const lead = leadSegment;
      if (!lead || lead.length === 0) {
        resetToNeedLead();
        return { done: false };
      }
      const combinedFallback = [...lead, ...rearFallbackSegment];
      phase = 'cooldown';
      cooldownUntilMs = now + COMBO_COOLDOWN_MS;
      leadSegment = null;
      rearTick = null;
      rearFallbackFrames = 0;
      rearFallbackSegment = [];
      return { done: true, segment: combinedFallback };
    }

    const lead = leadSegment;
    if (!lead || lead.length === 0) {
      resetToNeedLead();
      return { done: false };
    }

    const combined = [...lead, ...rearRes.segment];
    phase = 'cooldown';
    cooldownUntilMs = now + COMBO_COOLDOWN_MS;
    leadSegment = null;
    rearTick = null;
    return { done: true, segment: combined };
  };
}

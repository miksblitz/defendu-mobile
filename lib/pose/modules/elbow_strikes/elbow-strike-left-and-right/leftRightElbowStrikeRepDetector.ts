import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { getLeadArmSnapshot, isLeadElbowFinalPose } from '../lead-elbow-strike/leadElbowStrikeFormRules';
import {
  getRightElbowStrikeArmSnapshot,
  isRightElbowStrikeFinalPose,
} from '../elbow-strike-right/rightElbowStrikeFormRules';

const RIGHT_STRIKE_WINDOW_MS = 5000;
const COOLDOWN_MS = 900;
const MIN_GUARD_FRAMES = 2;
const MIN_RESET_GUARD_FRAMES = 2;

type Phase = 'waiting_guard' | 'need_lead' | 'need_right' | 'cooldown';

export function createLeftRightElbowStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: Phase = 'waiting_guard';
  let leadSegment: PoseFrame[] | null = null;
  let rightDeadlineMs = 0;
  let cooldownUntilMs = 0;
  let guardFrames = 0;

  function resetToNeedLead() {
    phase = 'waiting_guard';
    leadSegment = null;
    rightDeadlineMs = 0;
    cooldownUntilMs = 0;
    guardFrames = 0;
  }

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const leadFinal = isLeadElbowFinalPose(getLeadArmSnapshot(frame), false);
    const rightFinal = isRightElbowStrikeFinalPose(getRightElbowStrikeArmSnapshot(frame), false);

    if (phase === 'cooldown') {
      if (!leadFinal && !rightFinal) guardFrames = Math.min(guardFrames + 1, MIN_RESET_GUARD_FRAMES);
      else guardFrames = 0;
      if (now >= cooldownUntilMs && guardFrames >= MIN_RESET_GUARD_FRAMES) resetToNeedLead();
      return { done: false };
    }

    if (phase === 'waiting_guard') {
      if (!leadFinal && !rightFinal) guardFrames = Math.min(guardFrames + 1, MIN_GUARD_FRAMES);
      else guardFrames = 0;
      if (guardFrames >= MIN_GUARD_FRAMES) {
        phase = 'need_lead';
      }
      return { done: false };
    }

    if (phase === 'need_lead') {
      // Start combo only when lead pose is seen without right pose.
      if (leadFinal && !rightFinal) {
        leadSegment = [frame];
        phase = 'need_right';
        rightDeadlineMs = now + RIGHT_STRIKE_WINDOW_MS;
      }
      return { done: false };
    }

    // need_right
    if (now > rightDeadlineMs) {
      // Right elbow was not completed within 5 seconds -> not a perfect rep.
      resetToNeedLead();
      return { done: false };
    }

    // Flexible transition: allow brief lead/right overlap, but right must appear in window.
    if (!rightFinal) return { done: false };

    const lead = leadSegment;
    if (!lead || lead.length === 0) {
      resetToNeedLead();
      return { done: false };
    }

    const combined = [...lead, frame];
    phase = 'cooldown';
    cooldownUntilMs = now + COOLDOWN_MS;
    leadSegment = null;
    return { done: true, segment: combined };
  };
}

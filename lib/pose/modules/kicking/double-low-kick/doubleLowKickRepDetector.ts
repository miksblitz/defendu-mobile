/**
 * Double low kick — lead low kick (left) then rear low kick (right) within a time window.
 * Mirrors jab–cross combo: full rep only when both sub-detectors complete in order.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { createLeadLowKickRepDetector } from '../lead-low-kick/leadLowKickRepDetector';
import { createRearLowKickRepDetector } from '../rear-low-kick/rearLowKickRepDetector';

/** After a completed lead low kick, rear low kick must complete within this window or the combo fails and resets. */
const COMBO_TIMEOUT_MS = 3000;
const COMBO_COOLDOWN_MS = 800;

type Phase = 'need_lead' | 'need_rear' | 'cooldown';

export function createDoubleLowKickRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: Phase = 'need_lead';
  let leadTick = createLeadLowKickRepDetector();
  let rearTick: ReturnType<typeof createRearLowKickRepDetector> | null = null;
  let leadSegment: PoseFrame[] | null = null;
  let rearDeadlineMs = 0;
  let cooldownUntilMs = 0;

  function resetToNeedLead() {
    phase = 'need_lead';
    leadTick = createLeadLowKickRepDetector();
    rearTick = null;
    leadSegment = null;
    rearDeadlineMs = 0;
    cooldownUntilMs = 0;
  }

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      if (now >= cooldownUntilMs) resetToNeedLead();
      return { done: false };
    }

    if (phase === 'need_lead') {
      const leadRes = leadTick(frame, now);
      if (leadRes.done) {
        leadSegment = leadRes.segment;
        phase = 'need_rear';
        rearTick = createRearLowKickRepDetector();
        rearDeadlineMs = now + COMBO_TIMEOUT_MS;
      }
      return { done: false };
    }

    // need_rear
    if (now > rearDeadlineMs) {
      resetToNeedLead();
      return { done: false };
    }

    if (!rearTick) {
      resetToNeedLead();
      return { done: false };
    }

    const rearRes = rearTick(frame, now);
    if (!rearRes.done) return { done: false };

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

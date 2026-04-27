/**
 * Double low knee strike — combo detector (mirror of double high timing).
 *
 * - Lead event = RIGHT knee crosses into low strike pose (on/below hip + bent knee).
 * - Rear event = LEFT knee crosses into low strike pose within 5s after lead.
 * - After success: cooldown + both legs returned to reset (knees clearly below hip line).
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import { getIdx, inLowLeadStrikePose, lowLeadResetPose } from '../low-lead-knee-strike/lowLeadKneeStrikeGeometry';
import { inLowRearStrikePose, lowRearResetPose } from '../low-rear-knee-strike/lowRearKneeStrikeGeometry';

const COOLDOWN_MS = 650;
const MAX_REAR_FOLLOWUP_MS = 5000;

function bothLegsReset(frame: PoseFrame, idx: NonNullable<ReturnType<typeof getIdx>>): boolean {
  return lowLeadResetPose(frame, idx) && lowRearResetPose(frame, idx);
}

export function createDoubleLowKneeStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'waiting_rear' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let leadStartMs: number | null = null;
  let cooldownUntil = 0;
  let prevLeadStrike = false;
  let prevRearStrike = false;

  const resetToIdle = () => {
    phase = 'idle';
    segment = [];
    leadStartMs = null;
  };

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const idx = getIdx(frame);
    if (!idx) return { done: false };

    const leadStrike = inLowLeadStrikePose(frame, idx);
    const rearStrike = inLowRearStrikePose(frame, idx);
    const resetOk = bothLegsReset(frame, idx);

    const leadEnter = !prevLeadStrike && leadStrike;
    const rearEnter = !prevRearStrike && rearStrike;

    prevLeadStrike = leadStrike;
    prevRearStrike = rearStrike;

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      if (!resetOk) return { done: false };
      resetToIdle();
      return { done: false };
    }

    if (phase === 'idle') {
      if (rearEnter && !leadEnter) {
        resetToIdle();
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        return {
          done: true,
          segment: [frame],
          forcedBadRep: true,
          feedback: [{
            id: 'double-low-knee-wrong-order',
            message: 'Bad Repetition — for double low knee strike, throw the lead knee first, then the rear knee.',
            severity: 'error',
            phase: 'impact',
          }],
        };
      }
      if (!leadEnter) return { done: false };
      phase = 'waiting_rear';
      leadStartMs = now;
      segment = [frame];
      return { done: false };
    }

    if (leadStartMs != null && now - leadStartMs > MAX_REAR_FOLLOWUP_MS) {
      const lead = segment;
      resetToIdle();
      return {
        done: true,
        segment: lead.length > 0 ? [...lead] : [],
        forcedBadRep: true,
        feedback: [{
          id: 'combo-timeout-bad-rep-double-low-knee',
          message: 'Bad Repetition — throw the second knee right after the first. Try again.',
          severity: 'error',
          phase: 'impact',
        }],
      };
    }

    segment.push(frame);
    if (rearEnter) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      return { done: true, segment: out };
    }
    return { done: false };
  };
}

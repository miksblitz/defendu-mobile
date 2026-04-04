/**
 * Double high knee strike — custom combo detector.
 *
 * Rules:
 * - Lead event = RIGHT knee rises above hip line (crossing event)
 * - Rear event = LEFT knee rises above hip line (crossing event)
 * - Rear must happen within 5.0s after lead event
 * - After success, require cooldown + both knees down before re-arming
 *
 * This event-based approach is intentionally lenient and avoids needing a full
 * lead "hold then drop" before rear can be detected.
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';

const COOLDOWN_MS = 650;
const MAX_REAR_FOLLOWUP_MS = 5000;
const RAISE_ABOVE_HIP = 0.02;
const KNEES_DOWN_MARGIN = 0.006;

const MP = { lh: 23, rh: 24, lk: 25, rk: 26 };
const MN17 = { lh: 11, rh: 12, lk: 13, rk: 14 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function getIdx(frame: PoseFrame): typeof MP | typeof MN17 | null {
  if (frame.length > MP.rk) return MP;
  if (frame.length > MN17.rk) return MN17;
  return null;
}

function midHipY(frame: PoseFrame, idx: typeof MP | typeof MN17): number | null {
  const lh = frame[idx.lh];
  const rh = frame[idx.rh];
  if (!validPoint(lh) || !validPoint(rh)) return null;
  return (lh.y + rh.y) / 2;
}

function rightKneeAboveHip(frame: PoseFrame, idx: typeof MP | typeof MN17, margin: number): boolean {
  const line = midHipY(frame, idx);
  if (line == null) return false;
  const rk = frame[idx.rk];
  return validPoint(rk) && rk.y < line - margin;
}

function leftKneeAboveHip(frame: PoseFrame, idx: typeof MP | typeof MN17, margin: number): boolean {
  const line = midHipY(frame, idx);
  if (line == null) return false;
  const lk = frame[idx.lk];
  return validPoint(lk) && lk.y < line - margin;
}

function bothKneesDown(frame: PoseFrame, idx: typeof MP | typeof MN17, margin: number): boolean {
  const line = midHipY(frame, idx);
  if (line == null) return false;
  const lk = frame[idx.lk];
  const rk = frame[idx.rk];
  if (!validPoint(lk) || !validPoint(rk)) return false;
  return lk.y >= line - margin && rk.y >= line - margin;
}

export function createDoubleHighKneeStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'waiting_rear' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let leadStartMs: number | null = null;
  let cooldownUntil = 0;
  let prevLeadUp = false;
  let prevRearUp = false;

  const resetToIdle = () => {
    phase = 'idle';
    segment = [];
    leadStartMs = null;
  };

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const idx = getIdx(frame);
    if (!idx) return { done: false };

    const leadUp = rightKneeAboveHip(frame, idx, RAISE_ABOVE_HIP);
    const rearUp = leftKneeAboveHip(frame, idx, RAISE_ABOVE_HIP);
    const kneesDown = bothKneesDown(frame, idx, KNEES_DOWN_MARGIN);
    const leadRise = !prevLeadUp && leadUp;
    const rearRise = !prevRearUp && rearUp;

    // Update previous-state trackers before any early returns.
    prevLeadUp = leadUp;
    prevRearUp = rearUp;

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      if (!kneesDown) return { done: false };
      resetToIdle();
      return { done: false };
    }

    if (phase === 'idle') {
      if (!leadRise) return { done: false };
      phase = 'waiting_rear';
      leadStartMs = now;
      segment = [frame];
      return { done: false };
    }

    if (leadStartMs != null && now - leadStartMs > MAX_REAR_FOLLOWUP_MS) {
      resetToIdle();
      return { done: false };
    }

    // phase === 'waiting_rear'
    segment.push(frame);
    if (rearRise) {
      const out = [...segment];
      segment = [];
      phase = 'cooldown';
      cooldownUntil = now + COOLDOWN_MS;
      return { done: true, segment: out };
    }
    return { done: false };
  };
}

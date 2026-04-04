/**
 * Low rear knee strike — rep detector.
 *
 * Left knee on or below mid-hip line with a bent knee (mirror of low lead on the right).
 */

import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';
import {
  getIdx,
  inLowRearStrikePose,
  lowRearResetPose,
} from './lowRearKneeStrikeGeometry';

const COOLDOWN_MS = 650;
const MIN_REP_FRAMES = 3;

export function createLowRearKneeStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let phase: 'idle' | 'raised' | 'cooldown' = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;

  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    const idx = getIdx(frame);
    if (!idx) return { done: false };

    if (phase === 'cooldown') {
      if (now < cooldownUntil) return { done: false };
      if (!lowRearResetPose(frame, idx)) return { done: false };
      phase = 'idle';
      segment = [];
      return { done: false };
    }

    const strike = inLowRearStrikePose(frame, idx);

    if (phase === 'idle') {
      if (!lowRearResetPose(frame, idx)) return { done: false };
      if (!strike) return { done: false };
      phase = 'raised';
      segment = [frame];
      return { done: false };
    }

    if (!strike) {
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
      return { done: true, segment: out };
    }

    return { done: false };
  };
}

/**
 * Auto-detect one rep from pose stream. Behavior depends on focus:
 * - full: hip down then up (squat-style).
 * - punching: arm extension (wrist far from shoulder) then retract.
 * - kicking: leg up (knee/ankle Y low) then back down.
 */

import type { PoseFrame } from './types';
import type { PoseFocus } from './types';

const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

const MIN_REP_FRAMES = 5;
const COOLDOWN_MS = 1000;

// Full body: hip Y
const HIP_Y_DOWN = 0.50;
const HIP_Y_UP = 0.46;

// Punching: wrist-to-shoulder distance (extension threshold)
const ARM_EXTEND_THRESHOLD = 0.25;
const ARM_RETRACT_THRESHOLD = 0.18;

// Kicking: leg Y (lower = leg raised)
const LEG_Y_UP = 0.42;
const LEG_Y_DOWN = 0.50;

export type RepDetectorState = 'idle' | 'extended' | 'retracted' | 'cooldown';

export type RepDetectorResult =
  | { done: false }
  | { done: true; segment: PoseFrame[] };

function midHipY(frame: PoseFrame): number | null {
  if (frame.length <= Math.max(LEFT_HIP, RIGHT_HIP)) return null;
  const l = frame[LEFT_HIP];
  const r = frame[RIGHT_HIP];
  if (!l || !r) return null;
  return (l.y + r.y) / 2;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Max wrist-to-mid-shoulder distance (arm extension). */
function armExtension(frame: PoseFrame): number | null {
  if (frame.length <= Math.max(LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_WRIST, RIGHT_WRIST)) return null;
  const ls = frame[LEFT_SHOULDER];
  const rs = frame[RIGHT_SHOULDER];
  const lw = frame[LEFT_WRIST];
  const rw = frame[RIGHT_WRIST];
  if (!ls || !rs || !lw || !rw) return null;
  const mid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  return Math.max(dist(lw, mid), dist(rw, mid));
}

/** Min knee/ankle Y (leg raised = lower Y). */
function legRaiseY(frame: PoseFrame): number | null {
  if (frame.length <= Math.max(LEFT_ANKLE, RIGHT_ANKLE)) return null;
  const la = frame[LEFT_ANKLE];
  const ra = frame[RIGHT_ANKLE];
  const lk = frame[LEFT_KNEE];
  const rk = frame[RIGHT_KNEE];
  const ys = [la?.y, ra?.y, lk?.y, rk?.y].filter((y): y is number => typeof y === 'number');
  if (ys.length === 0) return null;
  return Math.min(...ys);
}

export function createRepDetector(focus: PoseFocus = 'full') {
  let phase: RepDetectorState = 'idle';
  let segment: PoseFrame[] = [];
  let cooldownUntil = 0;

  if (focus === 'punching') {
    return function tick(frame: PoseFrame, now: number): RepDetectorResult {
      if (phase === 'cooldown') {
        if (now >= cooldownUntil) phase = 'idle';
        return { done: false };
      }
      const ext = armExtension(frame);
      if (ext == null) return { done: false };

      if (phase === 'idle') {
        if (ext > ARM_EXTEND_THRESHOLD) {
          phase = 'extended';
          segment = [frame];
        }
        return { done: false };
      }
      if (phase === 'extended') {
        segment.push(frame);
        if (ext < ARM_RETRACT_THRESHOLD) phase = 'retracted';
        return { done: false };
      }
      if (phase === 'retracted') {
        segment.push(frame);
        if (segment.length >= MIN_REP_FRAMES) {
          const out = [...segment];
          segment = [];
          phase = 'cooldown';
          cooldownUntil = now + COOLDOWN_MS;
          return { done: true, segment: out };
        }
        return { done: false };
      }
      return { done: false };
    };
  }

  if (focus === 'kicking') {
    return function tick(frame: PoseFrame, now: number): RepDetectorResult {
      if (phase === 'cooldown') {
        if (now >= cooldownUntil) phase = 'idle';
        return { done: false };
      }
      const y = legRaiseY(frame);
      if (y == null) return { done: false };

      if (phase === 'idle') {
        if (y < LEG_Y_UP) {
          phase = 'extended';
          segment = [frame];
        }
        return { done: false };
      }
      if (phase === 'extended') {
        segment.push(frame);
        if (y > LEG_Y_DOWN) phase = 'retracted';
        return { done: false };
      }
      if (phase === 'retracted') {
        segment.push(frame);
        if (segment.length >= MIN_REP_FRAMES) {
          const out = [...segment];
          segment = [];
          phase = 'cooldown';
          cooldownUntil = now + COOLDOWN_MS;
          return { done: true, segment: out };
        }
        return { done: false };
      }
      return { done: false };
    };
  }

  // full: hip down then up
  return function tick(frame: PoseFrame, now: number): RepDetectorResult {
    if (phase === 'cooldown') {
      if (now >= cooldownUntil) phase = 'idle';
      return { done: false };
    }
    const y = midHipY(frame);
    if (y == null) return { done: false };

    if (phase === 'idle') {
      if (y > HIP_Y_DOWN) {
        phase = 'extended';
        segment = [frame];
      }
      return { done: false };
    }
    if (phase === 'extended') {
      segment.push(frame);
      if (y < HIP_Y_UP) phase = 'retracted';
      return { done: false };
    }
    if (phase === 'retracted') {
      segment.push(frame);
      if (segment.length >= MIN_REP_FRAMES) {
        const out = [...segment];
        segment = [];
        phase = 'cooldown';
        cooldownUntil = now + COOLDOWN_MS;
        return { done: true, segment: out };
      }
      return { done: false };
    }
    return { done: false };
  };
}

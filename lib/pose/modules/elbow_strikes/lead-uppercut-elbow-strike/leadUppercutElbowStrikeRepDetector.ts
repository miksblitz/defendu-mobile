import type { PoseFrame } from '../../../types';
import type { RepDetectorResult } from '../../types';

const MP_RIGHT = { sh: 12, el: 14, wr: 16 };
const MN17_RIGHT = { sh: 6, el: 8, wr: 10 };
const MP_LEFT = { sh: 11, el: 13, wr: 15 };
const MN17_LEFT = { sh: 5, el: 7, wr: 9 };

function validPoint(p: { x: number; y: number } | undefined): boolean {
  return p != null && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function metricsFromIndices(
  frame: PoseFrame,
  shoulderIdx: number,
  elbowIdx: number,
  wristIdx: number
): { elbowLift: number; wristAboveElbow: number } | null {
  if (frame.length <= Math.max(shoulderIdx, elbowIdx, wristIdx)) return null;
  const shoulder = frame[shoulderIdx];
  const elbow = frame[elbowIdx];
  const wrist = frame[wristIdx];
  if (!validPoint(shoulder) || !validPoint(elbow) || !validPoint(wrist)) return null;
  return {
    elbowLift: shoulder.y - elbow.y,
    wristAboveElbow: elbow.y - wrist.y,
  };
}

function bestRightStrikeMetrics(frame: PoseFrame) {
  const mp = metricsFromIndices(frame, MP_RIGHT.sh, MP_RIGHT.el, MP_RIGHT.wr);
  const mn = metricsFromIndices(frame, MN17_RIGHT.sh, MN17_RIGHT.el, MN17_RIGHT.wr);
  if (!mp && !mn) return null;
  if (!mp) return mn!;
  if (!mn) return mp;
  return mp.elbowLift >= mn.elbowLift ? mp : mn;
}

function bestLeftGuardMetrics(frame: PoseFrame) {
  const mp = metricsFromIndices(frame, MP_LEFT.sh, MP_LEFT.el, MP_LEFT.wr);
  const mn = metricsFromIndices(frame, MN17_LEFT.sh, MN17_LEFT.el, MN17_LEFT.wr);
  if (!mp && !mn) return null;
  if (!mp) return mn!;
  if (!mn) return mp;
  return mp.wristAboveElbow >= mn.wristAboveElbow ? mp : mn;
}

// Calibrated from lead uppercut elbow strike pose data.
const GUARD_MAX_LIFT = 0.21;
const TRANSITION_MIN_LIFT = 0.20;
const FINAL_MIN_LIFT = 0.27;
const FINAL_MAX_WRIST_ABOVE_ELBOW = -0.18;
const GUARD_MIN_WRIST_ABOVE_ELBOW = 0.10;
const MIN_GUARD_FRAMES_TO_COMPLETE = 2;

type LeadUppercutElbowState = 'waiting_guard' | 'transition' | 'impact' | 'returning';

export function createLeadUppercutElbowStrikeRepDetector(): (frame: PoseFrame, now: number) => RepDetectorResult {
  let state: LeadUppercutElbowState = 'waiting_guard';
  let segment: PoseFrame[] = [];
  let transitionSeen = false;
  let guardFrames = 0;

  return function tick(frame: PoseFrame): RepDetectorResult {
    const strike = bestRightStrikeMetrics(frame);
    const guard = bestLeftGuardMetrics(frame);
    if (!strike || !guard) return { done: false };

    const guardUp = guard.wristAboveElbow >= GUARD_MIN_WRIST_ABOVE_ELBOW;
    const inGuardPose = strike.elbowLift <= GUARD_MAX_LIFT && guardUp;
    const inTransition = strike.elbowLift >= TRANSITION_MIN_LIFT && strike.elbowLift < FINAL_MIN_LIFT && guardUp;
    const inFinal =
      strike.elbowLift >= FINAL_MIN_LIFT &&
      strike.wristAboveElbow <= FINAL_MAX_WRIST_ABOVE_ELBOW &&
      guardUp;

    if (state === 'waiting_guard') {
      segment = [];
      transitionSeen = false;
      guardFrames = 0;
      if (inGuardPose) {
        state = 'transition';
      }
      return { done: false };
    }

    segment.push(frame);

    if (state === 'transition') {
      if (inTransition) {
        transitionSeen = true;
        return { done: false };
      }
      if (inFinal) {
        state = 'impact';
        return { done: false };
      }
      if (!guardUp) {
        state = 'waiting_guard';
        segment = [];
        return { done: false };
      }
      return { done: false };
    }

    if (state === 'impact') {
      if (inFinal) {
        return { done: false };
      }
      if (inGuardPose) {
        state = 'returning';
        guardFrames = 1;
        return { done: false };
      }
      if (!guardUp) {
        state = 'waiting_guard';
        segment = [];
        return { done: false };
      }
      return { done: false };
    }

    // returning: rep completes only after stable guard re-entry
    if (inGuardPose) {
      guardFrames += 1;
      if (guardFrames >= MIN_GUARD_FRAMES_TO_COMPLETE && transitionSeen) {
        const out = [...segment];
        state = 'waiting_guard';
        segment = [];
        transitionSeen = false;
        guardFrames = 0;
        return { done: true, segment: out };
      }
      return { done: false };
    }

    if (inTransition || inFinal) {
      // Restart cycle if user goes back up before stabilizing guard
      state = inFinal ? 'impact' : 'transition';
      guardFrames = 0;
      transitionSeen = transitionSeen || inTransition;
      return { done: false };
    }

    state = 'waiting_guard';
    segment = [];
    transitionSeen = false;
    guardFrames = 0;
    return { done: false };
  };
}


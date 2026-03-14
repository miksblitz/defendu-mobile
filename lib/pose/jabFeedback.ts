/**
 * Rule-based jab feedback: elbow angle, wrist extension, guard, stance, rotation, head.
 * No ML training—pure geometry from pose landmarks. Good MVP before full sequence AI.
 * MediaPipe 33: 0 nose, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 23/24 hips, 25/26 knees, 27/28 ankles.
 */

import type { PoseFrame, PoseLandmark, PoseFeedbackItem, JabPhase } from './types';
import { armExtensionDistances } from './phaseDetection';

const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Angle at elbow in degrees (180 = straight). */
function elbowAngleDeg(shoulder: PoseLandmark, elbow: PoseLandmark, wrist: PoseLandmark): number {
  const ax = shoulder.x - elbow.x;
  const ay = shoulder.y - elbow.y;
  const bx = wrist.x - elbow.x;
  const by = wrist.y - elbow.y;
  const dot = ax * bx + ay * by;
  const magA = Math.sqrt(ax * ax + ay * ay) || 1e-6;
  const magB = Math.sqrt(bx * bx + by * by) || 1e-6;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Which arm is lead (extends more): 0 = left, 1 = right. */
function leadArm(frame: PoseFrame): 0 | 1 {
  const d = armExtensionDistances(frame);
  if (!d) return 0;
  return d.right >= d.left ? 1 : 0;
}

/** Hand height (y) relative to shoulder; lower y = higher on screen. Guard = hand near shoulder/face. */
function handHeightRelativeToShoulder(
  wrist: PoseLandmark,
  shoulder: PoseLandmark
): number {
  return (wrist.y - shoulder.y);
}

/** Stance width: horizontal distance between ankles (or hips if ankles missing). Normalized by body height. */
function stanceWidth(frame: PoseFrame): number | null {
  const la = frame[LEFT_ANKLE];
  const ra = frame[RIGHT_ANKLE];
  const lh = frame[LEFT_HIP];
  const rh = frame[RIGHT_HIP];
  const left = la ?? lh;
  const right = ra ?? rh;
  if (!left || !right) return null;
  const w = Math.abs(left.x - right.x);
  const shoulderMid = frame[LEFT_SHOULDER] && frame[RIGHT_SHOULDER]
    ? { x: (frame[LEFT_SHOULDER]!.x + frame[RIGHT_SHOULDER]!.x) / 2, y: (frame[LEFT_SHOULDER]!.y + frame[RIGHT_SHOULDER]!.y) / 2 }
    : null;
  const hipMid = lh && rh ? { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 } : null;
  if (!shoulderMid || !hipMid) return w;
  const bodyHeight = dist(shoulderMid, hipMid) * 2 || 0.2;
  return w / bodyHeight; // relative width
}

/** Shoulder line angle (rotation) in degrees; 0 = horizontal. */
function shoulderRotationDeg(frame: PoseFrame): number | null {
  const ls = frame[LEFT_SHOULDER];
  const rs = frame[RIGHT_SHOULDER];
  if (!ls || !rs) return null;
  const dx = rs.x - ls.x;
  const dy = rs.y - ls.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Head balance: nose relative to mid-hip (lean). */
function headBalance(frame: PoseFrame): { forward: number; lateral: number } | null {
  const nose = frame[NOSE];
  const lh = frame[LEFT_HIP];
  const rh = frame[RIGHT_HIP];
  if (!nose || !lh || !rh) return null;
  const midX = (lh.x + rh.x) / 2;
  const midY = (lh.y + rh.y) / 2;
  return {
    forward: nose.y - midY, // positive = head forward/down
    lateral: nose.x - midX,
  };
}

export interface JabMetrics {
  /** Punching arm: 0 = left, 1 = right */
  leadArm: 0 | 1;
  /** Elbow angle (degrees); 180 = straight */
  punchingElbowAngle: number | null;
  /** Wrist-to-shoulder distance (extension); full extension ~0.3–0.5 in normalized coords */
  punchingExtension: number | null;
  /** Rear hand: height diff from its shoulder (positive = hand below shoulder) */
  rearHandHeight: number | null;
  /** Stance width relative to body height */
  stanceWidth: number | null;
  /** Shoulder rotation (degrees) */
  shoulderRotation: number | null;
  /** Head relative to hips */
  headBalance: { forward: number; lateral: number } | null;
}

/**
 * Compute rule-based metrics from a single frame (e.g. impact phase).
 */
export function computeJabMetrics(frame: PoseFrame): JabMetrics {
  const arm = leadArm(frame);
  const ext = armExtensionDistances(frame);

  let punchingElbowAngle: number | null = null;
  let punchingExtension: number | null = null;
  let rearHandHeight: number | null = null;

  if (arm === 0) {
    punchingExtension = ext?.left ?? null;
    const ls = frame[LEFT_SHOULDER];
    const le = frame[LEFT_ELBOW];
    const lw = frame[LEFT_WRIST];
    if (ls && le && lw) punchingElbowAngle = elbowAngleDeg(ls, le, lw);
    const rs = frame[RIGHT_SHOULDER];
    const rw = frame[RIGHT_WRIST];
    if (rs && rw) rearHandHeight = handHeightRelativeToShoulder(rw, rs);
  } else {
    punchingExtension = ext?.right ?? null;
    const rs = frame[RIGHT_SHOULDER];
    const re = frame[RIGHT_ELBOW];
    const rw = frame[RIGHT_WRIST];
    if (rs && re && rw) punchingElbowAngle = elbowAngleDeg(rs, re, rw);
    const ls = frame[LEFT_SHOULDER];
    const lw = frame[LEFT_WRIST];
    if (ls && lw) rearHandHeight = handHeightRelativeToShoulder(lw, ls);
  }

  return {
    leadArm: arm,
    punchingElbowAngle,
    punchingExtension,
    rearHandHeight,
    stanceWidth: stanceWidth(frame),
    shoulderRotation: shoulderRotationDeg(frame),
    headBalance: headBalance(frame),
  };
}

/** Final-form only, very lenient: ~50% right is enough. Process doesn't matter. */
const RULES = {
  minElbowAngleAtImpact: 120,
  /** Extension: only fail if arm is almost not extended (very low bar) */
  minExtensionAtImpact: 0.04,
  maxRearHandDrop: 0.28,
  minStanceWidth: 0.2,
};

/**
 * Compare user metrics to reference metrics (or to fixed rules if ref is null).
 * Returns list of feedback items.
 */
export function compareJabMetrics(
  user: JabMetrics,
  reference: JabMetrics | null,
  phase?: JabPhase
): PoseFeedbackItem[] {
  const feedback: PoseFeedbackItem[] = [];

  if (reference) {
    if (user.punchingElbowAngle != null && reference.punchingElbowAngle != null) {
      const diff = reference.punchingElbowAngle - user.punchingElbowAngle;
      if (diff > 15) {
        feedback.push({
          id: 'elbow-not-straight',
          message: 'Straighten the punching arm more at extension',
          phase,
          severity: 'warning',
        });
      }
    }
    if (user.punchingExtension != null) {
      if (user.punchingExtension < RULES.minExtensionAtImpact) {
        feedback.push({
          id: 'front-hand-not-extended',
          message: 'Front hand not fully extended',
          phase,
          severity: 'error',
        });
      }
    }
    if (user.rearHandHeight != null && reference.rearHandHeight != null) {
      if (user.rearHandHeight > reference.rearHandHeight + 0.08) {
        feedback.push({
          id: 'rear-hand-dropped',
          message: 'Rear hand dropped from guard',
          phase,
          severity: 'warning',
        });
      }
    }
    if (user.stanceWidth != null && reference.stanceWidth != null) {
      if (user.stanceWidth < reference.stanceWidth * 0.75) {
        feedback.push({
          id: 'feet-too-close',
          message: 'Feet too close together',
          phase,
          severity: 'hint',
        });
      }
    }
    if (user.shoulderRotation != null && reference.shoulderRotation != null) {
      const rotDiff = Math.abs(user.shoulderRotation - reference.shoulderRotation);
      if (rotDiff > 25) {
        feedback.push({
          id: 'rotate-shoulder-more',
          message: 'Rotate shoulder more into the punch',
          phase,
          severity: 'hint',
        });
      }
    }
    // Head movement ignored for punching: we only judge body and arms.
  } else {
    // Pure rule-based (no reference)
    if (user.punchingElbowAngle != null && user.punchingElbowAngle < RULES.minElbowAngleAtImpact) {
      feedback.push({
        id: 'elbow-not-straight',
        message: 'Straighten the punching arm at impact',
        phase,
        severity: 'warning',
      });
    }
    if (user.punchingExtension != null && user.punchingExtension < RULES.minExtensionAtImpact) {
      feedback.push({
        id: 'front-hand-not-extended',
        message: 'Front hand not fully extended',
        phase,
        severity: 'error',
      });
    }
    if (user.rearHandHeight != null && user.rearHandHeight > RULES.maxRearHandDrop) {
      feedback.push({
        id: 'rear-hand-dropped',
        message: 'Rear hand dropped from guard',
        phase,
        severity: 'warning',
      });
    }
    if (user.stanceWidth != null && user.stanceWidth < RULES.minStanceWidth) {
      feedback.push({
        id: 'feet-too-close',
        message: 'Feet too close together',
        phase,
        severity: 'hint',
      });
    }
    // Head movement ignored for punching (body and arms only).
  }

  return feedback;
}

/**
 * Get rule-based feedback for a user rep vs reference (or rules-only).
 * Uses impact-phase frame if available; otherwise last frame.
 */
export function getJabFeedback(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): PoseFeedbackItem[] {
  if (userFrames.length === 0) return [];

  let userImpactFrame: PoseFrame | null = null;
  let refImpactFrame: PoseFrame | null = null;

  if (referencePhaseBounds && referenceFrames && referenceFrames.length > 0) {
    const impactBounds = referencePhaseBounds.find((b) => b.phase === 'impact');
    if (impactBounds) {
      const mid = Math.floor((impactBounds.start + impactBounds.end) / 2);
      refImpactFrame = referenceFrames[mid] ?? null;
    }
    if (!refImpactFrame) refImpactFrame = referenceFrames[Math.floor(referenceFrames.length / 2)] ?? null;
  }

  // User impact: approximate as frame with max extension in second half
  const ext = referenceFrames && referenceFrames.length > 0 ? leadArm(referenceFrames[0]!) : leadArm(userFrames[0]!);
  let maxExt = 0;
  let maxIdx = Math.floor(userFrames.length * 0.5);
  for (let i = Math.floor(userFrames.length * 0.3); i < userFrames.length; i++) {
    const d = armExtensionDistances(userFrames[i]!);
    const e = d ? (ext === 0 ? d.left : d.right) : 0;
    if (e > maxExt) {
      maxExt = e;
      maxIdx = i;
    }
  }
  userImpactFrame = userFrames[maxIdx] ?? userFrames[userFrames.length - 1]!;

  const userMetrics = computeJabMetrics(userImpactFrame);
  const refMetrics = refImpactFrame ? computeJabMetrics(refImpactFrame) : null;
  return compareJabMetrics(userMetrics, refMetrics, 'impact');
}

/** Only these feedback IDs can count as errors. Lower body never fails. */
const UPPER_BODY_ERROR_IDS = ['front-hand-not-extended', 'elbow-not-straight', 'rear-hand-dropped'];

/** Max upper-body errors allowed and still count as correct (50% leniency: allow up to 1 error). */
const MAX_ERRORS_TO_PASS = 1;

/**
 * Judge the rep by final form only (impact). Path and lower body don't matter.
 * Lenient: pass if at most MAX_ERRORS_TO_PASS upper-body errors (e.g. 1) so ~50% right is enough.
 */
export function isImpactFormAcceptable(
  userFrames: PoseFrame[],
  referenceFrames: PoseFrame[] | null,
  referencePhaseBounds?: { phase: JabPhase; start: number; end: number }[]
): { acceptable: boolean; feedback: PoseFeedbackItem[] } {
  const feedback = getJabFeedback(userFrames, referenceFrames, referencePhaseBounds);
  const errorCount = feedback.filter(
    (f) => f.severity === 'error' && UPPER_BODY_ERROR_IDS.includes(f.id)
  ).length;
  return { acceptable: errorCount <= MAX_ERRORS_TO_PASS, feedback };
}

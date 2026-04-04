import type { PoseFeedbackItem, PoseFrame } from '../../../types';
import {
  getRightElbowStrikeArmSnapshot,
  isRightElbowStrikeAlignedAndFlared,
  MAX_FLARE_ANGLE_DEG,
  MAX_SHOULDER_ELBOW_LEVEL_Y,
  MIN_ELBOW_LATERAL_OFFSET,
  MIN_FLARE_ANGLE_DEG,
  MIN_WRIST_LATERAL_OFFSET,
} from './rightElbowStrikeFormRules';

const ERROR_IDS = {
  noFinal: 'right-elbow-strike-final-missing',
  level: 'right-elbow-strike-not-level',
  lateral: 'right-elbow-strike-not-lateral',
  angle: 'right-elbow-strike-flare-angle',
} as const;

export function getRightElbowStrikeFeedback(userFrames: PoseFrame[]): PoseFeedbackItem[] {
  if (userFrames.length === 0) return [];

  let minAbsLift = Infinity;
  let maxElbowLat = -Infinity;
  let maxWristLat = -Infinity;
  let minAngle = Infinity;
  let maxAngle = -Infinity;
  let anyAngleInFlareRange = false;
  let finalSeen = false;
  let hadLandmarks = false;

  for (const frame of userFrames) {
    const s = getRightElbowStrikeArmSnapshot(frame);
    if (!s) continue;
    hadLandmarks = true;

    minAbsLift = Math.min(minAbsLift, Math.abs(s.elbowLift));
    maxElbowLat = Math.max(maxElbowLat, s.elbowFromShoulder);
    maxWristLat = Math.max(maxWristLat, s.wristLateralFromShoulder);
    minAngle = Math.min(minAngle, s.elbowAngleDeg);
    maxAngle = Math.max(maxAngle, s.elbowAngleDeg);
    if (s.elbowAngleDeg >= MIN_FLARE_ANGLE_DEG && s.elbowAngleDeg <= MAX_FLARE_ANGLE_DEG) {
      anyAngleInFlareRange = true;
    }

    if (isRightElbowStrikeAlignedAndFlared(s)) {
      finalSeen = true;
    }
  }

  if (finalSeen) return [];
  if (!hadLandmarks) {
    return [
      {
        id: ERROR_IDS.noFinal,
        message: 'Need a clear view of your left shoulder, elbow, and wrist.',
        phase: 'impact',
        severity: 'error',
      },
    ];
  }

  const feedback: PoseFeedbackItem[] = [];
  feedback.push({
    id: ERROR_IDS.noFinal,
    message:
      'Finish sideways: left elbow roughly near shoulder height (a bit lower or higher is fine) and arm flared—not straight up.',
    phase: 'impact',
    severity: 'error',
  });

  if (minAbsLift > MAX_SHOULDER_ELBOW_LEVEL_Y) {
    feedback.push({
      id: ERROR_IDS.level,
      message:
        'Get the left elbow closer to the shoulder-height band—small differences above/below are okay.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (maxElbowLat < MIN_ELBOW_LATERAL_OFFSET || maxWristLat < MIN_WRIST_LATERAL_OFFSET) {
    feedback.push({
      id: ERROR_IDS.lateral,
      message:
        'Reach the elbow and hand out to the side; avoid a vertical “hand up” stack beside the shoulder.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (!anyAngleInFlareRange) {
    const hint =
      maxAngle < MIN_FLARE_ANGLE_DEG
        ? 'Open the elbow more into a flared strike.'
        : minAngle > MAX_FLARE_ANGLE_DEG
          ? 'Bend the elbow—don’t snap the arm perfectly straight out; keep a noticeable angle at the joint.'
          : `Keep a bent elbow (about ${MIN_FLARE_ANGLE_DEG}°–${MAX_FLARE_ANGLE_DEG}° at the joint).`;
    feedback.push({
      id: ERROR_IDS.angle,
      message: hint,
      phase: 'impact',
      severity: 'error',
    });
  }

  return feedback;
}

export function isRightElbowStrikeFormAcceptable(userFrames: PoseFrame[]): {
  acceptable: boolean;
  feedback: PoseFeedbackItem[];
} {
  const feedback = getRightElbowStrikeFeedback(userFrames);
  return { acceptable: feedback.every((f) => f.severity !== 'error'), feedback };
}

import type { PoseFeedbackItem, PoseFrame } from '../../../types';
import {
  getBackwardsElbowStrikeSnapshot,
  isBackwardsElbowStrikeFinalPose,
  MIN_ELBOW_BACK_X,
  MIN_ELBOW_LIFT,
  MAX_ELBOW_LIFT,
  MIN_WRIST_FORWARD_X,
  MIN_ELBOW_ANGLE_DEG,
  MAX_ELBOW_ANGLE_DEG,
} from './backwardsElbowStrikeFormRules';

const ERROR_IDS = {
  noFinal: 'backwards-elbow-final-missing',
  back: 'backwards-elbow-not-back-enough',
  lift: 'backwards-elbow-not-level',
  tooHigh: 'backwards-elbow-too-high',
  wrist: 'backwards-elbow-wrist-position',
  angle: 'backwards-elbow-angle',
} as const;

export function getBackwardsElbowStrikeFeedback(userFrames: PoseFrame[]): PoseFeedbackItem[] {
  if (userFrames.length === 0) return [];

  let bestBackX = -Infinity;
  let bestLift = -Infinity;
  let highestLift = -Infinity;
  let bestWristForward = -Infinity;
  let minAngle = Infinity;
  let maxAngle = -Infinity;
  let finalSeen = false;
  let hadLandmarks = false;

  for (const frame of userFrames) {
    const s = getBackwardsElbowStrikeSnapshot(frame);
    if (!s) continue;
    hadLandmarks = true;
    bestBackX = Math.max(bestBackX, s.elbowBackX);
    bestLift = Math.max(bestLift, s.elbowLift);
    highestLift = Math.max(highestLift, s.elbowLift);
    bestWristForward = Math.max(bestWristForward, s.wristForwardX);
    minAngle = Math.min(minAngle, s.elbowAngleDeg);
    maxAngle = Math.max(maxAngle, s.elbowAngleDeg);
    if (isBackwardsElbowStrikeFinalPose(s)) finalSeen = true;
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

  const feedback: PoseFeedbackItem[] = [
    {
      id: ERROR_IDS.noFinal,
      message:
        'Finish with the left elbow driving backward behind your shoulder at about shoulder height, with a bent arm.',
      phase: 'impact',
      severity: 'error',
    },
  ];

  if (bestBackX < MIN_ELBOW_BACK_X) {
    feedback.push({
      id: ERROR_IDS.back,
      message: 'Drive the left elbow farther back behind the body.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (bestLift < MIN_ELBOW_LIFT) {
    feedback.push({
      id: ERROR_IDS.lift,
      message: 'Lift the left elbow to shoulder level (horizontal line).',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (highestLift > MAX_ELBOW_LIFT) {
    feedback.push({
      id: ERROR_IDS.tooHigh,
      message: 'Keep the left elbow from going too high; stay around shoulder level.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (bestWristForward < MIN_WRIST_FORWARD_X) {
    feedback.push({
      id: ERROR_IDS.wrist,
      message: 'Keep the left wrist slightly in front while the elbow pulls back.',
      phase: 'impact',
      severity: 'error',
    });
  }

  const angleOk = maxAngle >= MIN_ELBOW_ANGLE_DEG && minAngle <= MAX_ELBOW_ANGLE_DEG;
  if (!angleOk) {
    feedback.push({
      id: ERROR_IDS.angle,
      message: `Keep a bent elbow shape (about ${MIN_ELBOW_ANGLE_DEG}°-${MAX_ELBOW_ANGLE_DEG}°).`,
      phase: 'impact',
      severity: 'error',
    });
  }

  return feedback;
}

export function isBackwardsElbowStrikeFormAcceptable(userFrames: PoseFrame[]): {
  acceptable: boolean;
  feedback: PoseFeedbackItem[];
} {
  const feedback = getBackwardsElbowStrikeFeedback(userFrames);
  return { acceptable: feedback.every((f) => f.severity !== 'error'), feedback };
}

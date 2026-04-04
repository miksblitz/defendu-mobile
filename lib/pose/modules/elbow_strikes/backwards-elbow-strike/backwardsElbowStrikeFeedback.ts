import type { PoseFeedbackItem, PoseFrame } from '../../../types';
import {
  getBackwardsElbowStrikeArmSnapshot,
  isBackwardsElbowStrikeAligned,
  MAX_EXTENSION_ANGLE_DEG,
  MAX_ELBOW_DROP_BELOW_SHOULDER_Y,
  MAX_WRIST_LATERAL_FROM_SHOULDER,
  MIN_EXTENSION_ANGLE_DEG,
  MIN_ELBOW_DROP_BELOW_SHOULDER_Y,
  MIN_WRIST_LATERAL_FROM_SHOULDER,
  MIN_WRIST_RAISE_ABOVE_ELBOW_Y,
} from './backwardsElbowStrikeFormRules';

const ERROR_IDS = {
  noFinal: 'backwards-elbow-final-missing',
  drop: 'backwards-elbow-not-behind-low',
  wristRaise: 'backwards-elbow-wrist-not-up',
  lateral: 'backwards-elbow-hand-line',
  angle: 'backwards-elbow-not-extended',
} as const;

export function getBackwardsElbowStrikeFeedback(userFrames: PoseFrame[]): PoseFeedbackItem[] {
  if (userFrames.length === 0) return [];

  let maxDrop = -Infinity;
  let maxWristRaise = -Infinity;
  let minWristLat = Infinity;
  let maxWristLat = -Infinity;
  let minAngle = Infinity;
  let maxAngle = -Infinity;
  let anyAngleInRange = false;
  let finalSeen = false;
  let hadLandmarks = false;

  for (const frame of userFrames) {
    const s = getBackwardsElbowStrikeArmSnapshot(frame);
    if (!s) continue;
    hadLandmarks = true;

    const drop = -s.elbowLift;
    maxDrop = Math.max(maxDrop, drop);
    maxWristRaise = Math.max(maxWristRaise, s.wristAboveElbow);
    minWristLat = Math.min(minWristLat, s.wristLateralFromShoulder);
    maxWristLat = Math.max(maxWristLat, s.wristLateralFromShoulder);
    minAngle = Math.min(minAngle, s.elbowAngleDeg);
    maxAngle = Math.max(maxAngle, s.elbowAngleDeg);
    if (s.elbowAngleDeg >= MIN_EXTENSION_ANGLE_DEG && s.elbowAngleDeg <= MAX_EXTENSION_ANGLE_DEG) {
      anyAngleInRange = true;
    }

    if (isBackwardsElbowStrikeAligned(s)) {
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
      'Finish the backward elbow: left arm reaches back with the elbow clearly below the shoulder and the forearm lifting toward your head line.',
    phase: 'impact',
    severity: 'error',
  });

  if (maxDrop < MIN_ELBOW_DROP_BELOW_SHOULDER_Y || maxDrop > MAX_ELBOW_DROP_BELOW_SHOULDER_Y) {
    feedback.push({
      id: ERROR_IDS.drop,
      message:
        'Drop the striking elbow farther below shoulder height—think “elbow back and down,” not level with the shoulder.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (maxWristRaise < MIN_WRIST_RAISE_ABOVE_ELBOW_Y) {
    feedback.push({
      id: ERROR_IDS.wristRaise,
      message: 'Let the hand lift above the elbow so the forearm angles up on the backward strike.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (minWristLat < MIN_WRIST_LATERAL_FROM_SHOULDER || maxWristLat > MAX_WRIST_LATERAL_FROM_SHOULDER) {
    feedback.push({
      id: ERROR_IDS.lateral,
      message:
        'Keep the hand slightly off the shoulder stack in the frame—not pinned vertically to the body, not flung way out.',
      phase: 'impact',
      severity: 'error',
    });
  }

  if (!anyAngleInRange) {
    const hint =
      maxAngle < MIN_EXTENSION_ANGLE_DEG
        ? 'Extend the arm more—the backward elbow finishes almost straight, not sharply folded.'
        : minAngle > MAX_EXTENSION_ANGLE_DEG
          ? 'Avoid a soft, deeply bent arm; drive into a near-straight line from shoulder through elbow.'
          : `Aim for about ${MIN_EXTENSION_ANGLE_DEG}°–${MAX_EXTENSION_ANGLE_DEG}° at the elbow at the hit.`;
    feedback.push({
      id: ERROR_IDS.angle,
      message: hint,
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

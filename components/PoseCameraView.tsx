import React, { useCallback, useRef, useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  Animated,
  Easing,
} from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import type { PoseFrame, PoseSequence, PoseFocus } from '../lib/pose/types';
import { thinksysLandmarksToFrame } from '../lib/pose/mediapipeLandmarks';
import { compareRepWithFeedback, compareRepWithFeedbackAny, DEFAULT_MATCH_THRESHOLD } from '../lib/pose/comparator';
import { createRepDetector, createLeadJabRepDetector } from '../lib/pose/repDetector';
import { getModulePosePipeline } from '../lib/pose/modules/registry';
import type { PoseFeedbackItem } from '../lib/pose/types';
import { armExtensionDistances } from '../lib/pose/phaseDetection';
import { leadArm } from '../lib/pose/jabFeedback';
import { getLeadArmSnapshot, isLeadElbowFinalPose } from '../lib/pose/modules/elbow_strikes/lead-elbow-strike/leadElbowStrikeFormRules';
import { getRightElbowStrikeArmSnapshot, isRightElbowStrikeFinalPose } from '../lib/pose/modules/elbow_strikes/elbow-strike-right/rightElbowStrikeFormRules';
import { usePoseSkeletonOverlay } from '../lib/contexts/PoseSkeletonContext';

type SwitchCameraFn = (() => void) | null;

/** Whole seconds left until deadline (same as Math.ceil(ms / 1000) for integral ms). */
function wholeSecondsLeft(remainingMs: number): number {
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

const MAX_MONOTONIC_CATCHUP_GAP = 5;

/**
 * Avoid skipping a second when JS/native stalls: if the true remaining seconds drop by 2+ in one tick
 * but by at most MAX_MONOTONIC_CATCHUP_GAP, only step the display by one second until caught up.
 * Larger gaps mean a new deadline or long stall — use raw seconds.
 */
function monotonicWholeSecondsLeft(raw: number, prev: number | null): number {
  if (prev == null) return raw;
  if (raw >= prev) return raw;
  if (prev <= 0) return raw;
  if (prev - raw > MAX_MONOTONIC_CATCHUP_GAP) return raw;
  return Math.max(raw, prev - 1);
}

export interface PoseCameraViewProps {
  requiredReps: number;
  correctReps: number;
  isCurrentRepCorrect: boolean | null;
  onBack: () => void;
  /** Optional label for the overlay back/exit button. Defaults to "Back". */
  backLabel?: string;
  /** Show the back/exit button overlay. Defaults to true. */
  showBackButton?: boolean;
  /** Optional training timer text (e.g. "0:30") shown above the rep counter. */
  trainingTimerText?: string | null;
  /**
   * Optional training timer end time (ms since epoch).
   * When provided, the timer will be updated from the pose frame loop (more reliable than setInterval).
   */
  trainingTimerEndTimeMs?: number | null;
  /**
   * Called once when the training timer reaches 0.
   * Parent is responsible for navigating/advancing modules.
   */
  onTrainingTimerExpired?: () => void;
  /** Label under the timer text. Defaults to "time left". */
  trainingTimerLabel?: string;
  onCorrectRepsUpdate: (count: number, lastRepCorrect: boolean | null) => void;
  /** Reference pose sequence(s): one rep or array of reps (dataset). If null, practice mode. */
  referenceSequence: PoseSequence | PoseSequence[] | null;
  /** Focus region: punching (upper body), kicking (legs), or full. Default full. */
  poseFocus?: PoseFocus;
  /** Optional: match threshold for comparison (default 0.20). */
  matchThreshold?: number;
  /** Show the "Hand state" debug panel. Defaults to false (hidden unless enabled). */
  showArmState?: boolean;
  /** When true, hide the default bottom pose hint when there is no form feedback (e.g. module header covers it). */
  suppressBottomPoseHint?: boolean;
  /** Show the overlay hint text. Defaults to true. */
  showOverlayHint?: boolean;
  /** When 'lead-jab', use lead-jab rep logic (left extended sideways, right contracted wrist-up); no reference. */
  poseVariant?: 'default' | 'lead-jab';
  /** If set, use per-module pipeline from lib/pose/modules/<category>/<moduleId>/ when available. */
  moduleId?: string;
  /** Module category (e.g. Punching, Kicking) for pipeline lookup. */
  category?: string;
  /** Show startup 3-2-1 countdown overlay before detection starts. Defaults to true. */
  showStartCountdown?: boolean;
  /** When true, pose frames are ignored (no reps, no timer tick, no overlays from pose). */
  paused?: boolean;
}

const POSE_THROTTLE_MS = 100;
const MIN_FRAMES_FOR_REP = 5;
const MAX_BUFFER_FRAMES = 120;
const SUCCESS_OVERLAY_MS = 1800;
const WRONG_OVERLAY_MS = 1200;
const ARM_STATE_THROTTLE_MS = 180;
const PERFECT_REP_TRACK = require('../assets/audio/perfect-rep.mp3');
/** Hand only: wrist–shoulder distance. Need clear sustained move to show extending/contracting (reduces jitter). */
const ARM_TREND_THRESHOLD = 0.018;
/** Smooth over this many samples (recent avg vs older avg). */
const ARM_SMOOTH_WINDOW = 3;
/** Require this many consecutive same-direction updates before changing state (hysteresis). */
const ARM_STATE_CONFIRM_COUNT = 2;
const ELBOW_BENT_MAX_ANGLE_DEG = 150;
const LEFT_RIGHT_ELBOW_COMBO_MODULE_ID = 'module_0vFVfQfnHdeH57m9Fki70C0aZFv2_1774765697890';
const LEFT_RIGHT_ELBOW_COMBO_WINDOW_MS = 5000;

export type ArmMotionState = 'extending' | 'contracting' | 'neutral';
export type RealtimeArmState = {
  left: ArmMotionState;
  right: ArmMotionState;
  lead: 'left' | 'right' | null;
};
type ElbowBendLabel = 'bent' | 'straight' | 'unknown';
type RealtimeElbowState = {
  left: { label: ElbowBendLabel; angleDeg: number | null };
  right: { label: ElbowBendLabel; angleDeg: number | null };
};
function getArmIndicesForElbow(frame: PoseFrame): { ls: number; rs: number; le: number; re: number; lw: number; rw: number } | null {
  if (frame.length > 17) return { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };
  if (frame.length >= 11) return { ls: 5, rs: 6, le: 7, re: 8, lw: 9, rw: 10 };
  return null;
}

function elbowAngleDeg(
  shoulder: { x: number; y: number },
  elbow: { x: number; y: number },
  wrist: { x: number; y: number }
): number {
  const ax = shoulder.x - elbow.x;
  const ay = shoulder.y - elbow.y;
  const bx = wrist.x - elbow.x;
  const by = wrist.y - elbow.y;
  const denom = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (denom <= 1e-6) return 180;
  const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / denom));
  return (Math.acos(cos) * 180) / Math.PI;
}

function getRealtimeElbowState(frame: PoseFrame): RealtimeElbowState {
  const idx = getArmIndicesForElbow(frame);
  if (!idx || frame.length <= Math.max(idx.ls, idx.le, idx.lw, idx.rs, idx.re, idx.rw)) {
    return {
      left: { label: 'unknown', angleDeg: null },
      right: { label: 'unknown', angleDeg: null },
    };
  }

  const ls = frame[idx.ls];
  const le = frame[idx.le];
  const lw = frame[idx.lw];
  const rs = frame[idx.rs];
  const re = frame[idx.re];
  const rw = frame[idx.rw];

  const valid = (p: unknown): p is { x: number; y: number } =>
    !!p
    && typeof p === 'object'
    && Number.isFinite((p as { x?: number }).x)
    && Number.isFinite((p as { y?: number }).y);

  const leftAngle = valid(ls) && valid(le) && valid(lw) ? elbowAngleDeg(ls, le, lw) : null;
  const rightAngle = valid(rs) && valid(re) && valid(rw) ? elbowAngleDeg(rs, re, rw) : null;
  const labelOf = (angle: number | null): ElbowBendLabel => {
    if (angle == null) return 'unknown';
    return angle <= ELBOW_BENT_MAX_ANGLE_DEG ? 'bent' : 'straight';
  };

  return {
    left: { label: labelOf(leftAngle), angleDeg: leftAngle },
    right: { label: labelOf(rightAngle), angleDeg: rightAngle },
  };
}

export default function PoseCameraView({
  requiredReps,
  correctReps,
  isCurrentRepCorrect,
  onBack,
  backLabel = 'Back',
  showBackButton = true,
  trainingTimerText = null,
  trainingTimerEndTimeMs = null,
  onTrainingTimerExpired,
  trainingTimerLabel = 'time left',
  onCorrectRepsUpdate,
  referenceSequence,
  poseFocus = 'full',
  matchThreshold = DEFAULT_MATCH_THRESHOLD,
  showArmState = false,
  suppressBottomPoseHint = false,
  showOverlayHint = true,
  poseVariant = 'default',
  moduleId,
  category,
  showStartCountdown = true,
  paused = false,
}: PoseCameraViewProps) {
  const { skeletonVisible: showPoseSkeleton } = usePoseSkeletonOverlay();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const trainingTimerEndTimeMsRef = useRef(trainingTimerEndTimeMs);
  trainingTimerEndTimeMsRef.current = trainingTimerEndTimeMs;

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const pipeline = moduleId && category ? getModulePosePipeline(moduleId, category) : null;
  const [ready, setReady] = useState(false);
  const [MediaPipeView, setMediaPipeView] = useState<React.ComponentType<{ width: number; height: number; onLandmark: (data: unknown) => void; [key: string]: unknown }> | null>(null);
  const [switchCameraFn, setSwitchCameraFn] = useState<SwitchCameraFn>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [countdownDone, setCountdownDone] = useState(!showStartCountdown);
  const [countdownText, setCountdownText] = useState<string>('3');
  const countdownOpacity = useRef(new Animated.Value(0)).current;
  const countdownScale = useRef(new Animated.Value(0.92)).current;
  const countdownBgOpacity = useRef(new Animated.Value(0)).current;
  const countdownRunningRef = useRef(false);
  const countdownDoneRef = useRef(false);
  const frameBufferRef = useRef<PoseFrame[]>([]);
  const lastPoseTimeRef = useRef<number>(0);
  const repDetectorRef = useRef(
    pipeline
      ? pipeline.createRepDetector()
      : poseVariant === 'lead-jab'
        ? createLeadJabRepDetector()
        : createRepDetector(poseFocus)
  );
  useEffect(() => {
    repDetectorRef.current = pipeline
      ? pipeline.createRepDetector()
      : poseVariant === 'lead-jab'
        ? createLeadJabRepDetector()
        : createRepDetector(poseFocus);
  }, [poseFocus, poseVariant, pipeline]);
  const onCorrectRepsUpdateRef = useRef(onCorrectRepsUpdate);
  const correctRepsRef = useRef(correctReps);
  const referenceSequenceRef = useRef(referenceSequence);
  const matchThresholdRef = useRef(pipeline ? pipeline.defaultMatchThreshold : matchThreshold);
  const poseFocusRef = useRef(pipeline ? pipeline.poseFocus : poseFocus);
  const poseVariantRef = useRef(poseVariant);
  const pipelineRef = useRef(pipeline);
  poseFocusRef.current = pipeline ? pipeline.poseFocus : poseFocus;
  poseVariantRef.current = poseVariant;
  pipelineRef.current = pipeline;
  matchThresholdRef.current = pipeline ? pipeline.defaultMatchThreshold : matchThreshold;
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [showWrongOverlay, setShowWrongOverlay] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<PoseFeedbackItem[]>([]);

  const [computedTrainingTimerText, setComputedTrainingTimerText] = useState<string | null>(trainingTimerText);
  const lastTrainingTimerSecondsRef = useRef<number | null>(null);
  const lastTrainingTimerTickMsRef = useRef<number>(0);
  const trainingTimerExpiredRef = useRef(false);

  useLayoutEffect(() => {
    trainingTimerExpiredRef.current = false;
    lastTrainingTimerTickMsRef.current = 0;
    if (trainingTimerEndTimeMs != null && trainingTimerEndTimeMs > 0) {
      const remainingMs = trainingTimerEndTimeMs - Date.now();
      const remainingSeconds = wholeSecondsLeft(remainingMs);
      lastTrainingTimerSecondsRef.current = remainingSeconds;
      setComputedTrainingTimerText(formatTime(remainingSeconds));
    } else {
      lastTrainingTimerSecondsRef.current = null;
      setComputedTrainingTimerText(trainingTimerText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingTimerEndTimeMs, trainingTimerText]);
  const [realtimeArmState, setRealtimeArmState] = useState<RealtimeArmState>({
    left: 'neutral',
    right: 'neutral',
    lead: null,
  });
  const [realtimeElbowState, setRealtimeElbowState] = useState<RealtimeElbowState>({
    left: { label: 'unknown', angleDeg: null },
    right: { label: 'unknown', angleDeg: null },
  });
  const [lastRepArm, setLastRepArm] = useState<'left' | 'right' | null>(null);
  const [extensionValues, setExtensionValues] = useState<{ left: number; right: number } | null>(null);
  const [poseStatus, setPoseStatus] = useState<{ landmarkCount: number; hasArmData: boolean } | null>(null);
  const [comboDebug, setComboDebug] = useState<{ leadDetected: boolean; rightDetected: boolean; remainingMs: number }>({
    leadDetected: false,
    rightDetected: false,
    remainingMs: 0,
  });
  const poseStatusTimeRef = useRef<number>(0);
  const successFadeAnim = useRef(new Animated.Value(0)).current;
  const wrongFadeAnim = useRef(new Animated.Value(0)).current;
  const lastSuccessCountRef = useRef(0);
  const lastExtRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const lastArmStateTimeRef = useRef<number>(0);
  const extHistoryRef = useRef<{ left: number; right: number }[]>([]);
  const zeroLandmarksLoggedRef = useRef(false);
  const EXT_HISTORY_MAX = 10;
  const armStateStableRef = useRef<{
    left: ArmMotionState;
    right: ArmMotionState;
    pendingLeft: { trend: ArmMotionState; count: number };
    pendingRight: { trend: ArmMotionState; count: number };
  }>({
    left: 'neutral',
    right: 'neutral',
    pendingLeft: { trend: 'neutral', count: 0 },
    pendingRight: { trend: 'neutral', count: 0 },
  });
  const comboLeadSeenRef = useRef(false);
  const comboRightSeenRef = useRef(false);
  const comboWindowDeadlineRef = useRef<number | null>(null);
  const successSoundRef = useRef<import('expo-av').Audio.Sound | null>(null);
  const successSoundInitRef = useRef<Promise<void> | null>(null);
  const successSoundPlayChainRef = useRef<Promise<void>>(Promise.resolve());
  const POSE_STATUS_THROTTLE_MS = 500;
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  onCorrectRepsUpdateRef.current = onCorrectRepsUpdate;
  correctRepsRef.current = correctReps;
  referenceSequenceRef.current = referenceSequence;
  matchThresholdRef.current = matchThreshold;


  useEffect(() => {
    countdownDoneRef.current = countdownDone;
  }, [countdownDone]);

  useEffect(() => {
    if (!showStartCountdown) {
      countdownDoneRef.current = true;
      countdownRunningRef.current = false;
      setCountdownDone(true);
      countdownBgOpacity.setValue(0);
    }
  }, [countdownBgOpacity, showStartCountdown]);

  const showCountdownBeat = useCallback(
    (text: string, durationMs: number) => {
      setCountdownText(text);
      countdownOpacity.stopAnimation();
      countdownScale.stopAnimation();
      countdownOpacity.setValue(0);
      countdownScale.setValue(0.92);
      countdownBgOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(countdownOpacity, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(countdownScale, {
          toValue: 1,
          speed: 18,
          bounciness: 6,
          useNativeDriver: true,
        }),
      ]).start();
      return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
    },
    [countdownBgOpacity, countdownOpacity, countdownScale]
  );

  const finishCountdown = useCallback(() => {
    if (countdownDoneRef.current) return;
    countdownDoneRef.current = true;
    countdownRunningRef.current = false;
    setCountdownDone(true);
    Animated.timing(countdownBgOpacity, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [countdownBgOpacity]);

  const runCountdown = useCallback(async () => {
    if (countdownRunningRef.current || countdownDoneRef.current) return;
    countdownRunningRef.current = true;
    countdownDoneRef.current = false;
    setCountdownDone(false);

    const SLIDE_MS = 2000;
    await showCountdownBeat('3', SLIDE_MS);
    if (countdownDoneRef.current) return;
    await showCountdownBeat('2', SLIDE_MS);
    if (countdownDoneRef.current) return;
    await showCountdownBeat('1', SLIDE_MS);
    if (countdownDoneRef.current) return;
    await showCountdownBeat('ARE YOU READY?', SLIDE_MS);
    if (countdownDoneRef.current) return;
    await showCountdownBeat('GO!', SLIDE_MS);
    if (countdownDoneRef.current) return;
    finishCountdown();
  }, [finishCountdown, showCountdownBeat]);

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        if (cancelled) return;
        import('@thinksys/react-native-mediapipe')
          .then((mod) => {
            if (cancelled) return;
            setMediaPipeView(() => mod.RNMediapipe);
            try {
              setSwitchCameraFn(() => (typeof mod.switchCamera === 'function' ? mod.switchCamera : null));
            } catch (_) {
              setSwitchCameraFn(null);
            }
            setReady(true);
          })
          .catch((e) => {
            if (!cancelled) {
              setError(e instanceof Error ? e.message : 'Pose detection not available');
              setReady(false);
            }
          });
      }, 600);
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, []);

  useEffect(() => {
    if (ready && permission === null) requestPermission();
  }, [ready, permission, requestPermission]);

  useEffect(() => {
    if (!ready) return;
    if (!MediaPipeView) return;
    if (!permission?.granted) return;
    if (showStartCountdown) {
      runCountdown();
    } else {
      finishCountdown();
    }
    return () => {
      countdownRunningRef.current = false;
      countdownDoneRef.current = false;
    };
  }, [MediaPipeView, finishCountdown, permission?.granted, ready, runCountdown, showStartCountdown]);

  const ensureSuccessSoundLoaded = useCallback(async () => {
    if (successSoundRef.current) return;
    if (!successSoundInitRef.current) {
      successSoundInitRef.current = (async () => {
        const { Audio } = await import('expo-av');
        const { sound } = await Audio.Sound.createAsync(PERFECT_REP_TRACK, {
          shouldPlay: false,
          isLooping: false,
          volume: 1.0,
        });
        successSoundRef.current = sound;
      })().finally(() => {
        successSoundInitRef.current = null;
      });
    }
    await successSoundInitRef.current;
  }, []);

  const playSuccessSound = useCallback(() => {
    successSoundPlayChainRef.current = successSoundPlayChainRef.current.then(async () => {
      try {
        await ensureSuccessSoundLoaded();
        const snd = successSoundRef.current;
        if (!snd) return;
        try {
          await snd.stopAsync();
        } catch {}
        try {
          await snd.setPositionAsync(0);
          await snd.playAsync();
        } catch {
          await snd.replayAsync();
        }
      } catch {}
    });
  }, [ensureSuccessSoundLoaded]);

  useEffect(() => {
    return () => {
      const snd = successSoundRef.current;
      successSoundRef.current = null;
      if (!snd) return;
      snd.stopAsync().catch(() => {});
      snd.unloadAsync().catch(() => {});
    };
  }, []);

  const pushFrame = useCallback((frame: PoseFrame) => {
    if (frame.length === 0) return;
    if (!countdownDoneRef.current) return;
    const now = Date.now();
    if (now - lastPoseTimeRef.current < POSE_THROTTLE_MS) return;
    lastPoseTimeRef.current = now;
    const buf = frameBufferRef.current;
    buf.push(frame);
    while (buf.length > MAX_BUFFER_FRAMES) buf.shift();

    const result = repDetectorRef.current(frame, now);
    if (!result.done) return;
    if ('forcedBadRep' in result && result.forcedBadRep) {
      const currentCount = correctRepsRef.current;
      setLastFeedback(result.feedback);
      onCorrectRepsUpdateRef.current(currentCount, false);
      setShowWrongOverlay(true);
      wrongFadeAnim.setValue(1);
      Animated.timing(wrongFadeAnim, {
        toValue: 0,
        duration: WRONG_OVERLAY_MS,
        useNativeDriver: true,
      }).start(() => setShowWrongOverlay(false));
      return;
    }
    const segment = result.segment;
    const variant = poseVariantRef.current;
    const pl = pipelineRef.current;
    const minFrames = pl ? pl.minFramesForRep : variant === 'lead-jab' ? 3 : MIN_FRAMES_FOR_REP;
    if (segment.length < minFrames) return;

    const ref = referenceSequenceRef.current;
    const threshold = matchThresholdRef.current;
    const currentCount = correctRepsRef.current;
    const isLeadJab = variant === 'lead-jab';

    let match: boolean;
    let feedback: PoseFeedbackItem[] = [];
    if (pl) {
      const focus = pl.poseFocus;
      const isArray = Array.isArray(ref) && ref.length > 0 && Array.isArray(ref[0]);
      const hasReference = ref != null && (
        isArray
          ? (ref as PoseSequence[]).some((seq) => seq.length >= minFrames)
          : (ref as PoseSequence).length >= minFrames
      );
      if (!hasReference) {
        match = true;
        setLastRepArm('left');
      } else if (isArray) {
        const res = pl.compareRepWithFeedbackAny(segment, ref as PoseSequence[], threshold, focus);
        match = res.match;
        feedback = res.feedback;
        const midFrame = segment[Math.floor(segment.length / 2)];
        const arm = midFrame ? leadArm(midFrame) : null;
        setLastRepArm(arm === 1 ? 'left' : arm === 0 ? 'right' : null);
      } else {
        const res = pl.compareRepWithFeedback(segment, ref as PoseSequence, threshold, focus);
        match = res.match;
        feedback = res.feedback;
        const midFrame = segment[Math.floor(segment.length / 2)];
        const arm = midFrame ? leadArm(midFrame) : null;
        setLastRepArm(arm === 1 ? 'left' : arm === 0 ? 'right' : null);
      }
    } else if (isLeadJab) {
      match = true;
      setLastRepArm('left');
    } else {
      const isArray = Array.isArray(ref) && ref.length > 0 && Array.isArray(ref[0]);
      const hasReference = ref != null && (
        isArray
          ? (ref as PoseSequence[]).some((seq) => seq.length >= MIN_FRAMES_FOR_REP)
          : (ref as PoseSequence).length >= MIN_FRAMES_FOR_REP
      );
      const focus = poseFocusRef.current;
      if (!hasReference) {
        match = true;
      } else if (isArray) {
        const result = compareRepWithFeedbackAny(segment, ref as PoseSequence[], threshold, focus);
        match = result.match;
        feedback = result.feedback;
      } else {
        const result = compareRepWithFeedback(segment, ref as PoseSequence, threshold, focus);
        match = result.match;
        feedback = result.feedback;
      }
      const midFrame = segment[Math.floor(segment.length / 2)];
      const arm = midFrame ? leadArm(midFrame) : null;
      setLastRepArm(arm === 1 ? 'left' : arm === 0 ? 'right' : null);
    }

    if (match) {
      const newCount = currentCount + 1;
      if (moduleId === LEFT_RIGHT_ELBOW_COMBO_MODULE_ID) {
        comboLeadSeenRef.current = false;
        comboRightSeenRef.current = false;
        comboWindowDeadlineRef.current = null;
        setComboDebug({ leadDetected: false, rightDetected: false, remainingMs: 0 });
      }
      lastSuccessCountRef.current = newCount;
      onCorrectRepsUpdateRef.current(newCount, true);
      setSuccessCount(newCount);
      setShowSuccessOverlay(true);
      successFadeAnim.setValue(1);
      playSuccessSound();
      Animated.timing(successFadeAnim, {
        toValue: 0,
        duration: SUCCESS_OVERLAY_MS,
        useNativeDriver: true,
      }).start(() => setShowSuccessOverlay(false));
    } else {
      setLastFeedback(feedback);
      onCorrectRepsUpdateRef.current(currentCount, false);
      setShowWrongOverlay(true);
      wrongFadeAnim.setValue(1);
      Animated.timing(wrongFadeAnim, {
        toValue: 0,
        duration: WRONG_OVERLAY_MS,
        useNativeDriver: true,
      }).start(() => setShowWrongOverlay(false));
    }
  }, [playSuccessSound, successFadeAnim, wrongFadeAnim]);

  const handleLandmark = useCallback(
    (data: unknown) => {
      if (!countdownDoneRef.current) return;
      if (pausedRef.current) return;
      const frame = thinksysLandmarksToFrame(data);
      const now = Date.now();

      // Update training timer from the same frame loop as pose detection.
      // This avoids relying on JS timers that can get starved while camera callbacks are busy.
      // Read deadline from a ref so native callbacks never use a stale end time after pause/clearProps.
      const endMs = trainingTimerEndTimeMsRef.current;
      if (endMs != null && endMs > 0) {
        if (now - lastTrainingTimerTickMsRef.current >= 250) {
          lastTrainingTimerTickMsRef.current = now;
          const remainingMs = endMs - now;
          const rawSeconds = wholeSecondsLeft(remainingMs);
          const displaySeconds = monotonicWholeSecondsLeft(rawSeconds, lastTrainingTimerSecondsRef.current);

          if (lastTrainingTimerSecondsRef.current !== displaySeconds) {
            lastTrainingTimerSecondsRef.current = displaySeconds;
            setComputedTrainingTimerText(formatTime(displaySeconds));
          }

          if (remainingMs <= 0 && !trainingTimerExpiredRef.current) {
            trainingTimerExpiredRef.current = true;
            onTrainingTimerExpired?.();
          }
        }
      }

      if (frame.length > 0) {
        if (moduleId === LEFT_RIGHT_ELBOW_COMBO_MODULE_ID) {
          const leadNow = isLeadElbowFinalPose(getLeadArmSnapshot(frame), false);
          const rightNow = isRightElbowStrikeFinalPose(getRightElbowStrikeArmSnapshot(frame), false);
          if (!comboLeadSeenRef.current && leadNow) {
            comboLeadSeenRef.current = true;
            comboRightSeenRef.current = false;
            comboWindowDeadlineRef.current = now + LEFT_RIGHT_ELBOW_COMBO_WINDOW_MS;
          }
          if (comboLeadSeenRef.current && !comboRightSeenRef.current && rightNow) {
            comboRightSeenRef.current = true;
          }
          const remaining = comboWindowDeadlineRef.current
            ? Math.max(0, comboWindowDeadlineRef.current - now)
            : 0;
          if (comboLeadSeenRef.current && !comboRightSeenRef.current && remaining <= 0) {
            comboLeadSeenRef.current = false;
            comboWindowDeadlineRef.current = null;
          }
          setComboDebug({
            leadDetected: comboLeadSeenRef.current,
            rightDetected: comboRightSeenRef.current,
            remainingMs: comboLeadSeenRef.current && !comboRightSeenRef.current ? remaining : 0,
          });
        }
        pushFrame(frame);
        setRealtimeElbowState(getRealtimeElbowState(frame));
        const ext = armExtensionDistances(frame);

        // Throttled pose status so user always sees if pose/arms are detected
        if (now - poseStatusTimeRef.current >= POSE_STATUS_THROTTLE_MS) {
          poseStatusTimeRef.current = now;
          setPoseStatus({ landmarkCount: frame.length, hasArmData: !!ext });
        }

        // Hand-only state: wrist–shoulder distance, smoothed + hysteresis so it doesn’t flip randomly
        if (ext) {
          if (now - lastArmStateTimeRef.current >= ARM_STATE_THROTTLE_MS) {
            lastArmStateTimeRef.current = now;
            const history = extHistoryRef.current;
            history.push({ left: ext.left, right: ext.right });
            if (history.length > EXT_HISTORY_MAX) history.shift();
            lastExtRef.current = { left: ext.left, right: ext.right };
            setExtensionValues({ left: ext.left, right: ext.right });

            const stable = armStateStableRef.current;
            const need = ARM_SMOOTH_WINDOW * 2;
            const rawTrend = (delta: number): ArmMotionState =>
              delta > ARM_TREND_THRESHOLD ? 'extending' : delta < -ARM_TREND_THRESHOLD ? 'contracting' : 'neutral';

            const applyHysteresis = (
              raw: ArmMotionState,
              pending: { trend: ArmMotionState; count: number },
              displayed: ArmMotionState
            ): ArmMotionState => {
              if (raw === 'neutral') {
                pending.trend = 'neutral';
                pending.count = 0;
                return displayed;
              }
              if (raw === pending.trend) {
                pending.count = Math.min(pending.count + 1, ARM_STATE_CONFIRM_COUNT);
                return pending.count >= ARM_STATE_CONFIRM_COUNT ? raw : displayed;
              }
              pending.trend = raw;
              pending.count = 1;
              return displayed;
            };

            let leftState: ArmMotionState = stable.left;
            let rightState: ArmMotionState = stable.right;

            if (history.length >= need) {
              const w = ARM_SMOOTH_WINDOW;
              const recentL = history.slice(-w).reduce((s, h) => s + h.left, 0) / w;
              const olderL = history.slice(-w * 2, -w).reduce((s, h) => s + h.left, 0) / w;
              const recentR = history.slice(-w).reduce((s, h) => s + h.right, 0) / w;
              const olderR = history.slice(-w * 2, -w).reduce((s, h) => s + h.right, 0) / w;
              const rawL = rawTrend(recentL - olderL);
              const rawR = rawTrend(recentR - olderR);
              leftState = applyHysteresis(rawL, stable.pendingLeft, stable.left);
              rightState = applyHysteresis(rawR, stable.pendingRight, stable.right);
              stable.left = leftState;
              stable.right = rightState;
            }

            const lead: 'left' | 'right' | null =
              ext.left > 0.05 || ext.right > 0.05 ? (ext.right >= ext.left ? 'right' : 'left') : null;
            setRealtimeArmState({ left: leftState, right: rightState, lead });
          }
        }
      } else if (now - poseStatusTimeRef.current >= POSE_STATUS_THROTTLE_MS) {
        poseStatusTimeRef.current = now;
        setPoseStatus({ landmarkCount: 0, hasArmData: false });
        if (__DEV__ && !zeroLandmarksLoggedRef.current && data !== undefined) {
          zeroLandmarksLoggedRef.current = true;
          const hint = data == null ? 'null' : Array.isArray(data) ? `array(${(data as unknown[]).length})` : typeof data === 'object' ? `object keys: ${Object.keys(data as object).join(',')}` : typeof data;
          console.warn('[Pose] 0 landmarks. Native payload:', hint);
        }
      }
    },
    [pushFrame, onTrainingTimerExpired]
  );

  if (!ready || error) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          {!ready && !error && (
            <>
              <ActivityIndicator size="large" color="#07bbc0" />
              <Text style={styles.hint}>Loading pose detection...</Text>
            </>
          )}
          {error && (
            <>
              <Text style={styles.title}>Try with pose</Text>
              <Text style={styles.hint}>{error}</Text>
            </>
          )}
        </View>
        {showBackButton && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (permission && !permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.title}>Try with pose</Text>
          <Text style={styles.hint}>Camera permission is required for pose detection.</Text>
          <TouchableOpacity style={styles.repButton} onPress={requestPermission}>
            <Text style={styles.repButtonText}>Allow camera</Text>
          </TouchableOpacity>
        </View>
        {showBackButton && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (permission === null) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <ActivityIndicator size="large" color="#07bbc0" />
          <Text style={styles.hint}>Requesting camera permission...</Text>
        </View>
        {showBackButton && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const hasRef = referenceSequence != null && (
    Array.isArray(referenceSequence) && Array.isArray(referenceSequence[0])
      ? (referenceSequence as PoseSequence[]).some((seq) => seq.length >= MIN_FRAMES_FOR_REP)
      : (referenceSequence as PoseSequence).length >= MIN_FRAMES_FOR_REP
  );
  const practiceMode = !hasRef;

  if (!MediaPipeView) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.hint}>Initializing camera...</Text>
        </View>
        {showBackButton && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MediaPipeView
        width={Math.round(screenWidth)}
        height={Math.round(screenHeight)}
        onLandmark={handleLandmark}
        face={showPoseSkeleton}
        leftArm={showPoseSkeleton}
        rightArm={showPoseSkeleton}
        leftWrist={showPoseSkeleton}
        rightWrist={showPoseSkeleton}
        torso={showPoseSkeleton}
        leftLeg={showPoseSkeleton}
        rightLeg={showPoseSkeleton}
        leftAnkle={showPoseSkeleton}
        rightAnkle={showPoseSkeleton}
      />
      {!countdownDone && (
        <Animated.View
          style={[styles.countdownOverlay, { opacity: countdownBgOpacity }]}
          pointerEvents="auto"
        >
          <Pressable style={styles.countdownPressArea} onPress={finishCountdown}>
            <Animated.View
              style={[
                styles.countdownCard,
                { opacity: countdownOpacity, transform: [{ scale: countdownScale }] },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.countdownText}>{countdownText}</Text>
              <Text style={styles.countdownHint}>Tap to skip</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      )}
      {showSuccessOverlay && (
        <Animated.View
          style={[
            styles.successOverlay,
            { opacity: successFadeAnim },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.successNumber}>{lastSuccessCountRef.current || successCount}</Text>
          <Text style={styles.successSubtext}>Correct rep!</Text>
          <Text style={styles.successRepCounted}>Rep counted — keep going!</Text>
        </Animated.View>
      )}
      {showWrongOverlay && (
        <Animated.View
          style={[styles.wrongOverlay, { opacity: wrongFadeAnim }]}
          pointerEvents="none"
        >
          {(() => {
            const isTimeoutBadRep = lastFeedback.some((f) => f.id.includes('combo-timeout-bad-rep'));
            return (
              <>
          <Text style={styles.wrongText}>
            {isTimeoutBadRep
              ? 'Bad Repetition'
              : 'Wrong form'}
          </Text>
          <Text style={styles.wrongSubtext}>
            {isTimeoutBadRep
              ? 'Try again:'
              : lastFeedback.length > 0
              ? 'Try again:'
              : 'No match — extend arm fully toward camera. Face the camera.'}
          </Text>
              </>
            );
          })()}
          {lastFeedback.length > 0 && (
            <View style={styles.feedbackList}>
              {lastFeedback.slice(0, 4).map((item) => (
                (() => {
                  const urgentMessages = new Set([
                    'FACE LEFT!',
                    'KEEP BOTH HANDS UP!',
                    'WRONG ARM!',
                    'WRONG LEG!',
                    'WRONG COMBO!',
                    'FINISH COMBO!',
                    'WRONG MOTION!',
                    'WRONG DIRECTION!',
                    'TOO HIGH/TOO LOW!',
                    'NO STRAIGHT!',
                    'KEEP FOOT FRONT!',
                  ]);
                  const isUrgentFeedback =
                    urgentMessages.has(item.message) ||
                    item.id.includes('bad-rep') ||
                    item.id === 'guard-not-up-while-slipping' ||
                    item.id === 'wrong-parry-arm' ||
                    item.id.includes('facing-right-bad-rep') ||
                    item.id === 'low-lead-knee-opposite-leg' ||
                    item.id === 'low-rear-knee-opposite-leg' ||
                    item.id === 'high-lead-knee-opposite-leg' ||
                    item.id === 'high-rear-knee-opposite-leg' ||
                    item.id === 'double-low-knee-wrong-order' ||
                    item.id === 'double-high-knee-wrong-order' ||
                    item.id === 'combo-timeout-bad-rep-double-low-knee' ||
                    item.id === 'combo-timeout-bad-rep-double-high-knee';
                  return (
                <Text
                  key={item.id}
                  style={[
                    styles.feedbackItem,
                    isUrgentFeedback ? styles.feedbackItemUrgent : null,
                  ]}
                >
                  {isUrgentFeedback ? item.message : `• ${item.message}`}
                </Text>
                  );
                })()
              ))}
            </View>
          )}
        </Animated.View>
      )}
      <View style={styles.overlay}>
        {/* Hand state: wrist–shoulder only, smoothed + hysteresis */}
        {showArmState && (poseFocus === 'punching' || poseFocus === 'full') && (
          <View style={styles.armStateBox}>
            <Text style={styles.armStateTitle}>Hand state</Text>
            {poseStatus === null && (
              <Text style={styles.armStateStatus}>Waiting for pose…</Text>
            )}
            {poseStatus !== null && !poseStatus.hasArmData && (
              <Text style={styles.armStateStatus}>
                {poseStatus.landmarkCount} landmarks — full body in frame, good light, 2–3 m from camera
              </Text>
            )}
            {extensionValues != null && (
              <>
                <Text style={styles.armStateRaw}>
                  Your left: {extensionValues.right.toFixed(3)} · Your right: {extensionValues.left.toFixed(3)}
                </Text>
                <Text style={styles.armStateText}>
                  Left hand: {realtimeArmState.right} · Right hand: {realtimeArmState.left}
                </Text>
                <Text style={styles.armStateText}>
                  Left arm: {realtimeElbowState.right.label}
                  {realtimeElbowState.right.angleDeg != null ? ` (${Math.round(realtimeElbowState.right.angleDeg)} deg)` : ''}
                  {' '}· Right arm: {realtimeElbowState.left.label}
                  {realtimeElbowState.left.angleDeg != null ? ` (${Math.round(realtimeElbowState.left.angleDeg)} deg)` : ''}
                </Text>
                {realtimeArmState.lead != null && (
                  <Text style={styles.armStateLead}>
                    Punching arm: {realtimeArmState.lead === 'right' ? 'Left' : 'Right'}
                  </Text>
                )}
                {lastRepArm != null && (
                  <Text style={styles.armStateLastRep}>Last rep: {lastRepArm === 'left' ? 'Left' : 'Right'} jab</Text>
                )}
                {moduleId === LEFT_RIGHT_ELBOW_COMBO_MODULE_ID && (
                  <>
                    <Text style={styles.armStateLastRep}>lead detected: {comboDebug.leadDetected ? 'yes' : 'no'}</Text>
                    <Text style={styles.armStateLastRep}>right detected: {comboDebug.rightDetected ? 'yes' : 'no'}</Text>
                    <Text style={styles.armStateLastRep}>right window time remaining (ms): {Math.round(comboDebug.remainingMs)}</Text>
                  </>
                )}
              </>
            )}
          </View>
        )}
        {lastFeedback.length > 0 ? (
          <Text style={[styles.overlayTitle, poseFocus === 'full' ? styles.overlayTitleFull : null]}>
            {lastFeedback[0]?.message ?? ''}
          </Text>
        ) : suppressBottomPoseHint ? null : (
          <Text style={[styles.overlayTitle, poseFocus === 'full' ? styles.overlayTitleFull : null]}>
            {poseVariant === 'lead-jab'
              ? 'Lead jab: left hand out to the side, right hand in guard (wrist up)'
              : poseFocus === 'punching'
                ? 'Upper body in frame — each full extension = 1 rep'
                : poseFocus === 'kicking'
                  ? 'Legs in frame — raise leg then lower'
                  : 'Full body in frame — reps count automatically'}
          </Text>
        )}
        {showOverlayHint && (
          <Text style={styles.overlayHint}>
            Do a clear down–up movement so your hips go lower then back up
          </Text>
        )}
        {!practiceMode && referenceSequence && (() => {
          const seq = Array.isArray(referenceSequence) ? referenceSequence[0] : referenceSequence;
          const frameCount = seq?.length ?? 0;
          const multi = Array.isArray(referenceSequence) && (referenceSequence as PoseSequence[]).length > 1;
          return (
            <Text style={styles.referenceLoadedLabel}>
              Reference: {frameCount} frames{multi ? ` (${(referenceSequence as PoseSequence[]).length} examples)` : ''} · {poseFocus}
            </Text>
          );
        })()}
        {(trainingTimerEndTimeMs != null ? computedTrainingTimerText : trainingTimerText) ? (
          <View style={styles.trainingTimerBlock}>
            <Text style={styles.trainingTimerText}>
              {trainingTimerEndTimeMs != null ? computedTrainingTimerText : trainingTimerText}
            </Text>
            <Text style={styles.trainingTimerLabel}>{trainingTimerLabel}</Text>
          </View>
        ) : null}
        <View style={styles.repBox}>
          <Text style={styles.repText}>
            {correctReps} / {requiredReps}
          </Text>
        </View>
      </View>
      {showBackButton && (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const IS_ANDROID_POSE = Platform.OS === 'android';
const POSE_BACK_BUTTON_TOP = IS_ANDROID_POSE ? 24 : 50;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#041527' },
  placeholder: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#07bbc0', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  hint: { color: '#6b8693', fontSize: 14, marginBottom: 24, textAlign: 'center' },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  countdownPressArea: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  countdownCard: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(4, 21, 39, 0.78)',
  },
  countdownText: {
    color: '#FFF',
    fontWeight: '900',
    letterSpacing: 0.6,
    textAlign: 'center',
    fontSize: 56,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  countdownHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.2,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 60,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 197, 94, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successNumber: {
    fontSize: 140,
    fontWeight: '800',
    color: '#FFF',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  successSubtext: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    marginTop: 8,
  },
  successRepCounted: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
  },
  wrongOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wrongText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
  },
  wrongSubtext: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
    textAlign: 'center',
  },
  feedbackList: {
    marginTop: 12,
    paddingHorizontal: 24,
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  feedbackItem: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 4,
    textAlign: 'left',
  },
  feedbackItemUrgent: {
    fontSize: 44,
    fontWeight: '900',
    textAlign: 'center',
    alignSelf: 'stretch',
    color: '#FFFFFF',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  armStateBox: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  armStateTitle: { color: '#07bbc0', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  armStateStatus: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 6 },
  armStateRaw: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 4, fontVariant: ['tabular-nums'] },
  armStateText: { color: 'rgba(255,255,255,0.95)', fontSize: 14, marginBottom: 2 },
  armStateLead: { color: 'rgba(34,197,94,0.95)', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  armStateLastRep: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  overlayTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 4 },
  overlayTitleFull: { color: '#07bbc0' },
  overlayHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 8 },
  referenceLoadedLabel: { color: 'rgba(34,197,94,0.95)', fontSize: 12, marginBottom: 4 },
  trainingTimerBlock: { alignItems: 'center', marginBottom: 8 },
  trainingTimerText: { color: '#07bbc0', fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] },
  trainingTimerLabel: { color: '#6b8693', fontSize: 14, marginTop: 4 },
  repBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  repText: { color: '#07bbc0', fontSize: 22, fontWeight: '700' },
  repButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#07bbc0',
  },
  repButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  backButton: {
    position: 'absolute',
    top: POSE_BACK_BUTTON_TOP,
    left: 16,
    // Keep consistent button sizing across all session steps.
    width: 60,
    paddingVertical: 8,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  backButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

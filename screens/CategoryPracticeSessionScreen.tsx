import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AuthController, type ModuleItem } from '../lib/controllers/AuthController';
import type { Module } from '../lib/models/Module';
import type { PoseFocus, PoseFrame, PoseSequence } from '../lib/pose/types';
import { DEFAULT_MATCH_THRESHOLD, PUNCHING_MATCH_THRESHOLD } from '../lib/pose/comparator';
import { DEFAULT_POSE_FOCUS } from '../lib/pose/types';
import PoseCameraView from '../components/PoseCameraView';
import { getRequiredReps } from '../utils/repRange';
import { getCooldownGuideSource, getWarmupGuideSource } from '../lib/warmupGuideAssets';

type SessionStep =
  | 'warmup_countdown'
  | 'warmup_timer'
  | 'warmup_between_countdown'
  | 'training_safety'
  | 'training_countdown'
  | 'training_stance'
  | 'training_pose_loading'
  | 'training_pose'
  | 'training_success'
  | 'training_between_countdown'
  | 'training_between_stance'
  | 'cooldown_countdown'
  | 'cooldown_timer'
  | 'cooldown_between_countdown'
  | 'session_done';

type CountdownText = '3' | '2' | '1' | 'READY YOUR STANCE' | 'ARE YOU READY?' | 'GO!!';

export interface CategoryPracticeSessionScreenProps {
  category: string;
  warmups: string[];
  cooldowns: string[];
  trainingModules: ModuleItem[];
  mannequinGifUri?: string | null;
  onExit: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function frameToArray(frame: unknown): PoseFrame | null {
  if (Array.isArray(frame) && frame.length > 0) return frame as PoseFrame;
  if (frame && typeof frame === 'object') {
    const keys = Object.keys(frame)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    if (keys.length > 0) {
      const arr = keys.map((k) => (frame as Record<string, unknown>)[k]);
      if (arr.every((p) => p && typeof p === 'object' && 'x' in p)) return arr as PoseFrame;
    }
  }
  return null;
}

function toPoseSequence(val: unknown): PoseSequence | null {
  let arr: unknown[] = [];
  if (Array.isArray(val) && val.length > 0) arr = val;
  else if (val && typeof val === 'object' && !Array.isArray(val)) {
    const keys = Object.keys(val)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    if (keys.length > 0) arr = keys.map((k) => (val as Record<string, unknown>)[k]);
  }
  if (arr.length === 0) return null;
  const frames = arr.map((frame) => frameToArray(frame)).filter((f): f is PoseFrame => f != null);
  return frames.length > 0 ? frames : null;
}

function toPoseSequenceArray(val: unknown): PoseSequence[] | null {
  let arr: unknown[] = [];
  if (Array.isArray(val) && val.length > 0) arr = val;
  else if (val && typeof val === 'object' && !Array.isArray(val)) {
    const keys = Object.keys(val)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    if (keys.length > 0) arr = keys.map((k) => (val as Record<string, unknown>)[k]);
  }
  if (arr.length === 0) return null;
  const seqs = arr.map((s) => toPoseSequence(s)).filter((s): s is PoseSequence => s != null);
  return seqs.length > 0 ? seqs : null;
}

async function loadReferenceSequence(module: Module): Promise<{
  referencePoseSequence: PoseSequence | PoseSequence[] | null;
  referencePoseFocus: PoseFocus;
}> {
  const focusVal =
    module.referencePoseFocus === 'punching' || module.referencePoseFocus === 'kicking' || module.referencePoseFocus === 'full'
      ? module.referencePoseFocus
      : DEFAULT_POSE_FOCUS;

  if (module.hasReferencePose) {
    const data = await AuthController.getReferencePoseData(module.moduleId);
    if (data?.sequences?.length) {
      const seqs = toPoseSequenceArray(data.sequences);
      if (seqs?.length) {
        const focus =
          data.focus === 'punching' || data.focus === 'kicking' || data.focus === 'full' ? data.focus : focusVal;
        return { referencePoseSequence: seqs, referencePoseFocus: focus };
      }
    }
    return { referencePoseSequence: null, referencePoseFocus: focusVal };
  }

  const inlineSeqs = toPoseSequenceArray(module.referencePoseSequences);
  if (inlineSeqs && inlineSeqs.length > 0) {
    return { referencePoseSequence: inlineSeqs, referencePoseFocus: focusVal };
  }

  const inlineSeq = toPoseSequence(module.referencePoseSequence);
  if (inlineSeq) {
    return { referencePoseSequence: inlineSeq, referencePoseFocus: focusVal };
  }

  if (module.referencePoseSequenceUrl) {
    const res = await fetch(module.referencePoseSequenceUrl);
    const data: unknown = await res.json();
    const obj = data && typeof data === 'object' && !Array.isArray(data) ? (data as { focus?: PoseFocus }) : {};
    const focus =
      obj.focus === 'punching' || obj.focus === 'kicking' || obj.focus === 'full' ? obj.focus : focusVal;

    const asAny = data as any;
    if (data && typeof data === 'object' && Array.isArray(asAny.sequences)) {
      const seqs = toPoseSequenceArray(asAny.sequences);
      return { referencePoseSequence: seqs?.length ? seqs : null, referencePoseFocus: focus };
    }

    const seq = toPoseSequence(data);
    return { referencePoseSequence: seq, referencePoseFocus: focus };
  }

  return { referencePoseSequence: null, referencePoseFocus: focusVal };
}

const COUNTDOWN_STEPS: SessionStep[] = [
  'warmup_countdown',
  'warmup_between_countdown',
  'training_countdown',
  'training_stance',
  'training_success',
  'training_between_countdown',
  'training_between_stance',
  'cooldown_countdown',
  'cooldown_between_countdown',
];

function isFullScreenCountdownStep(step: SessionStep): boolean {
  return COUNTDOWN_STEPS.includes(step);
}

export default function CategoryPracticeSessionScreen({
  category,
  warmups,
  cooldowns,
  trainingModules,
  mannequinGifUri,
  onExit,
}: CategoryPracticeSessionScreenProps) {
  const [step, setStep] = useState<SessionStep>('warmup_countdown');

  const warmupNames = useMemo(() => warmups.filter((w) => !!w && w !== '—'), [warmups]);
  const cooldownNames = useMemo(() => cooldowns.filter((c) => !!c && c !== '—'), [cooldowns]);

  const [warmupIndex, setWarmupIndex] = useState(0);
  const [cooldownIndex, setCooldownIndex] = useState(0);
  const [trainingIndex, setTrainingIndex] = useState(0);

  const [activeExerciseName, setActiveExerciseName] = useState<string>('');

  const [countdownText, setCountdownText] = useState<CountdownText>('3');
  const countdownTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(30);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInitializedSessionRef = useRef(false);

  const hasRecordedCompletionRef = useRef(false);
  // Prevent restarting the timer interval on re-renders while still on `training_pose`.
  const trainingTimerEpochRef = useRef<number>(-1);
  const [trainingTimerEndTimeMs, setTrainingTimerEndTimeMs] = useState<number | null>(null);

  const currentTrainingItem = trainingModules[trainingIndex] ?? null;
  const [module, setModule] = useState<Module | null>(null);

  const [poseCorrectReps, setPoseCorrectReps] = useState(0);
  const [poseCurrentRepCorrect, setPoseCurrentRepCorrect] = useState<boolean | null>(null);
  const [referencePoseSequence, setReferencePoseSequence] = useState<PoseSequence | PoseSequence[] | null>(null);
  const [referencePoseFocus, setReferencePoseFocus] = useState<PoseFocus>(DEFAULT_POSE_FOCUS);
  const [poseLoadingError, setPoseLoadingError] = useState<string | null>(null);
  const [poseSessionKey, setPoseSessionKey] = useState(0);
  const [isTrainingPrepared, setIsTrainingPrepared] = useState(false);
  const trainingPrepRequestRef = useRef(0);
  const isTrainingPreparedRef = useRef(false);
  const moduleRef = useRef<Module | null>(null);

  const [hasRecordedCompletion, setHasRecordedCompletion] = useState(false);
  useEffect(() => {
    hasRecordedCompletionRef.current = hasRecordedCompletion;
  }, [hasRecordedCompletion]);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [hasShownTrainingSafety, setHasShownTrainingSafety] = useState(false);
  const [showTrainingFailed, setShowTrainingFailed] = useState(false);

  const requiredReps = module ? getRequiredReps(module.repRange) : 0;
  const matchThreshold = referencePoseFocus === 'punching' ? PUNCHING_MATCH_THRESHOLD : DEFAULT_MATCH_THRESHOLD;
  const requiredRepsRef = useRef<number>(requiredReps);
  const poseCorrectRepsRef = useRef<number>(poseCorrectReps);

  useEffect(() => {
    requiredRepsRef.current = requiredReps;
  }, [requiredReps]);

  useEffect(() => {
    poseCorrectRepsRef.current = poseCorrectReps;
  }, [poseCorrectReps]);

  useEffect(() => {
    isTrainingPreparedRef.current = isTrainingPrepared;
  }, [isTrainingPrepared]);

  useEffect(() => {
    moduleRef.current = module;
  }, [module]);

  const clearCountdown = () => {
    for (const t of countdownTimeoutsRef.current) clearTimeout(t);
    countdownTimeoutsRef.current = [];
  };

  const clearTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const clearStanceTimeout = () => {
    if (stanceTimeoutRef.current) {
      clearTimeout(stanceTimeoutRef.current);
      stanceTimeoutRef.current = null;
    }
  };

  const clearSuccessTimeout = () => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  };

  const startTimer = (seconds: number, onDone: () => void) => {
    clearTimer();
    setTimerRemainingSeconds(seconds);
    timerIntervalRef.current = setInterval(() => {
      setTimerRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearTimer();
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const runReadyGoCountdown = (onDone: () => void, opts?: { showGo?: boolean }) => {
    clearCountdown();
    const schedule = (text: CountdownText, delayMs: number) => {
      const tid = setTimeout(() => setCountdownText(text), delayMs);
      countdownTimeoutsRef.current.push(tid);
    };
    setCountdownText('3');
    // Slightly slower cadence for readability.
    schedule('3', 0);
    schedule('2', 900);
    schedule('1', 1800);
    schedule('ARE YOU READY?', 2700);
    if (opts?.showGo !== false) {
      schedule('GO!!', 3700);
    }
    const finalTid = setTimeout(() => onDone(), 4700);
    countdownTimeoutsRef.current.push(finalTid);
  };

  const exitTrainingToCooldownOrDone = useCallback(() => {
    if (cooldownNames.length > 0) {
      setCooldownIndex(0);
      setActiveExerciseName(cooldownNames[0] ?? '');
      setStep('cooldown_countdown');
    } else {
      setStep('session_done');
    }
  }, [cooldownNames]);

  const startTrainingCountdown = useCallback(
    (index: number) => {
      setTrainingIndex(index);
      // Show safety protocol exactly once: before the first training module countdown.
      if (index === 0 && !hasShownTrainingSafety) setStep('training_safety');
      else setStep('training_countdown');
    },
    [hasShownTrainingSafety]
  );

  const loadTrainingForCurrentModule = useCallback(async () => {
    if (!currentTrainingItem) {
      exitTrainingToCooldownOrDone();
      return;
    }

    const requestId = trainingPrepRequestRef.current + 1;
    trainingPrepRequestRef.current = requestId;
    const modId = currentTrainingItem.moduleId;

    setIsTrainingPrepared(false);
    setPoseLoadingError(null);
    setPoseSessionKey((k) => k + 1);
    setPoseCorrectReps(0);
    setPoseCurrentRepCorrect(null);
    setReferencePoseSequence(null);
    setReferencePoseFocus(DEFAULT_POSE_FOCUS);
    setModule(null);

    try {
      const full = await AuthController.getModuleByIdForUser(modId);
      if (trainingPrepRequestRef.current !== requestId) return;
      if (!full) throw new Error('Module not found');
      setModule(full);
      const refLoaded = await loadReferenceSequence(full);
      if (trainingPrepRequestRef.current !== requestId) return;
      setReferencePoseSequence(refLoaded.referencePoseSequence);
      setReferencePoseFocus(refLoaded.referencePoseFocus);
      setIsTrainingPrepared(true);
    } catch (e) {
      if (trainingPrepRequestRef.current !== requestId) return;
      setPoseLoadingError(e instanceof Error ? e.message : 'Pose loading failed');
      setReferencePoseSequence(null);
      setReferencePoseFocus(
        currentTrainingItem.category === 'Punching' ? 'punching' : currentTrainingItem.category === 'Kicking' ? 'kicking' : 'full'
      );
      setModule({
        moduleId: modId,
        trainerId: '',
        moduleTitle: currentTrainingItem.moduleTitle ?? 'Training module',
        description: '',
        category,
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
        repRange: 'default',
      } as unknown as Module);
      setIsTrainingPrepared(true);
    }
  }, [category, currentTrainingItem, exitTrainingToCooldownOrDone]);

  const proceedAfterTraining = useCallback(() => {
    setHasRecordedCompletion(false);
    setShowTrainingFailed(false);
    clearSuccessTimeout();
    clearTimer();
    // Reset the pose timer so returning to this module starts fresh.
    trainingTimerEpochRef.current = -1;
    setTrainingTimerEndTimeMs(null);
    const next = trainingIndex + 1;
    if (next < trainingModules.length) {
      startTrainingCountdown(next);
    } else {
      exitTrainingToCooldownOrDone();
    }
  }, [exitTrainingToCooldownOrDone, startTrainingCountdown, clearTimer, trainingIndex, trainingModules.length]);

  const handleTrainingTimerExpired = useCallback(() => {
    if (hasRecordedCompletionRef.current) return;
    const required = requiredRepsRef.current;
    const achieved = poseCorrectRepsRef.current;
    if (required > 0 && achieved < required) {
      setShowTrainingFailed(true);
      return;
    }
    proceedAfterTraining();
  }, [proceedAfterTraining]);

  const skipCurrentWorkout = useCallback(() => {
    clearCountdown();
    clearTimer();
    clearSuccessTimeout();
    setShowTrainingFailed(false);
    trainingTimerEpochRef.current = -1;
    setTrainingTimerEndTimeMs(null);

    if (step === 'training_safety') {
      setHasShownTrainingSafety(true);
      setStep('training_countdown');
      return;
    }

    if (step === 'warmup_countdown' || step === 'warmup_timer' || step === 'warmup_between_countdown') {
      const next = warmupIndex + 1;
      if (next < warmupNames.length) {
        setWarmupIndex(next);
        setActiveExerciseName(warmupNames[next] ?? '');
        // Skip should trigger a single countdown only once.
        setStep('warmup_countdown');
      } else if (trainingModules.length > 0) {
        startTrainingCountdown(0);
      } else {
        exitTrainingToCooldownOrDone();
      }
      return;
    }

    if (
      step === 'training_countdown' ||
      step === 'training_stance' ||
      step === 'training_pose_loading' ||
      step === 'training_pose' ||
      step === 'training_between_countdown' ||
      step === 'training_between_stance'
    ) {
      trainingPrepRequestRef.current += 1;
      setHasRecordedCompletion(false);
      setIsTrainingPrepared(false);
      setModule(null);
      const next = trainingIndex + 1;
      if (next < trainingModules.length) {
        startTrainingCountdown(next);
      } else {
        exitTrainingToCooldownOrDone();
      }
      return;
    }

    if (step === 'cooldown_countdown' || step === 'cooldown_timer' || step === 'cooldown_between_countdown') {
      const next = cooldownIndex + 1;
      if (next < cooldownNames.length) {
        setCooldownIndex(next);
        setActiveExerciseName(cooldownNames[next] ?? '');
        // Skip should trigger a single countdown only once.
        setStep('cooldown_countdown');
      } else {
        setStep('session_done');
      }
    }
  }, [
    cooldownIndex,
    cooldownNames,
    exitTrainingToCooldownOrDone,
    hasShownTrainingSafety,
    step,
    startTrainingCountdown,
    trainingIndex,
    trainingModules.length,
    warmupIndex,
    warmupNames,
  ]);

  const handleRetryTraining = useCallback(() => {
    // Retry the same module: reset pose evaluation counters + timer, then restart pose loading.
    setShowTrainingFailed(false);
    setHasRecordedCompletion(false);
    clearSuccessTimeout();
    setPoseCorrectReps(0);
    setPoseCurrentRepCorrect(null);
    trainingTimerEpochRef.current = -1;
    setTrainingTimerEndTimeMs(null);
    // Force PoseCameraView remount to reset its internal state.
    setPoseSessionKey((k) => k + 1);
    // Go back to module's pose phase without changing trainingIndex.
    setStep('training_pose_loading');
  }, []);

  useEffect(() => {
    return () => {
      clearStanceTimeout();
      clearSuccessTimeout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmSkip = useCallback(() => {
    setShowSkipConfirm(true);
  }, [skipCurrentWorkout]);

  const handleSkipNo = useCallback(() => {
    setShowSkipConfirm(false);
  }, []);

  const handleSkipYes = useCallback(() => {
    setShowSkipConfirm(false);
    skipCurrentWorkout();
  }, [skipCurrentWorkout]);

  const handleQuitNo = useCallback(() => setShowQuitConfirm(false), []);
  const handleQuitYes = useCallback(() => {
    setShowQuitConfirm(false);
    onExit();
  }, [onExit]);

  const confirmQuit = useCallback(() => {
    setShowQuitConfirm(true);
  }, []);

  // Initialize session entry step.
  useEffect(() => {
    if (hasInitializedSessionRef.current) return;
    hasInitializedSessionRef.current = true;

    if (warmupNames.length > 0) {
      setActiveExerciseName(warmupNames[0] ?? '');
      setWarmupIndex(0);
      setStep('warmup_countdown');
      return;
    }

    if (trainingModules.length > 0) {
      startTrainingCountdown(0);
      return;
    }

    if (cooldownNames.length > 0) {
      setCooldownIndex(0);
      setActiveExerciseName(cooldownNames[0] ?? '');
      setStep('cooldown_countdown');
      return;
    }

    setStep('session_done');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldownNames.length, trainingModules.length, warmupNames.length, startTrainingCountdown]);

  // Warmup: countdown then 30s timer.
  useEffect(() => {
    if (step !== 'warmup_countdown') return;
    runReadyGoCountdown(() => {
      setStep('warmup_timer');
      startTimer(30, () => {
        const next = warmupIndex + 1;
        if (next < warmupNames.length) {
          setWarmupIndex(next);
          setActiveExerciseName(warmupNames[next] ?? '');
          setStep('warmup_between_countdown');
        } else if (trainingModules.length > 0) {
          startTrainingCountdown(0);
        } else {
          exitTrainingToCooldownOrDone();
        }
      });
    });
    return () => clearCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, warmupIndex, warmupNames.length, trainingModules.length, exitTrainingToCooldownOrDone, startTrainingCountdown]);

  // Between warmups: countdown then next warmup countdown phase.
  useEffect(() => {
    if (step !== 'warmup_between_countdown') return;
    // Avoid double countdown between warmups: immediately continue to the single warmup countdown.
    setStep('warmup_countdown');
  }, [step, warmupIndex]);

  // Before each training module: countdown then load pose.
  useEffect(() => {
    if (step !== 'training_countdown') return;
    loadTrainingForCurrentModule().catch(() => {});
    runReadyGoCountdown(() => {
      setStep('training_stance');
    }, { showGo: true });
    return () => clearCountdown();
  }, [step, trainingIndex, loadTrainingForCurrentModule]);

  // Dedicated stance page after training countdown.
  useEffect(() => {
    if (step !== 'training_stance') return;
    setCountdownText('READY YOUR STANCE');
    clearStanceTimeout();
    stanceTimeoutRef.current = setTimeout(() => {
      if (isTrainingPreparedRef.current && moduleRef.current) {
        setStep('training_pose');
      } else {
        setStep('training_pose_loading');
      }
    }, 5000);
    return () => clearStanceTimeout();
  }, [step]);

  // After training module (reps met): countdown then next module or cooldown.
  useEffect(() => {
    if (step !== 'training_between_countdown') return;
    // Safety: we only want 3→2→1 once per module (handled by training_countdown).
    // If training_between_countdown is reached, skip the numeric countdown.
    setStep('training_between_stance');
  }, [step]);

  useEffect(() => {
    if (step !== 'training_between_stance') return;
    setCountdownText('READY YOUR STANCE');
    clearStanceTimeout();
    stanceTimeoutRef.current = setTimeout(() => {
      proceedAfterTraining();
    }, 5000);
    return () => clearStanceTimeout();
  }, [step, proceedAfterTraining]);

  // Cooldown: countdown then 30s timer.
  useEffect(() => {
    if (step !== 'cooldown_countdown') return;
    runReadyGoCountdown(() => {
      setStep('cooldown_timer');
      startTimer(30, () => {
        const next = cooldownIndex + 1;
        if (next < cooldownNames.length) {
          setCooldownIndex(next);
          setActiveExerciseName(cooldownNames[next] ?? '');
          setStep('cooldown_between_countdown');
        } else {
          setStep('session_done');
        }
      });
    });
    return () => clearCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cooldownIndex, cooldownNames.length]);

  // Between cooldowns: countdown then next cooldown.
  useEffect(() => {
    if (step !== 'cooldown_between_countdown') return;
    runReadyGoCountdown(() => setStep('cooldown_countdown'));
    return () => clearCountdown();
  }, [step, cooldownIndex]);

  useEffect(() => {
    if (step !== 'warmup_timer' && step !== 'cooldown_timer') clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step !== 'training_pose_loading') return;
    if (isTrainingPrepared && module) {
      setStep('training_pose');
      return;
    }
    loadTrainingForCurrentModule().catch(() => {});
  }, [step, isTrainingPrepared, module, loadTrainingForCurrentModule]);

  useEffect(() => {
    if (step !== 'training_pose') return;
    if (!module) return;
    if (showTrainingFailed) return;
    if (hasRecordedCompletion) return;
    if (poseCorrectReps >= requiredReps && requiredReps > 0) {
      setHasRecordedCompletion(true);
      AuthController.recordModuleCompletion(module.moduleId)
        .catch(() => {})
        .finally(() => {
          clearSuccessTimeout();
          setStep('training_success');
          successTimeoutRef.current = setTimeout(() => {
            // Move directly to the next module countdown so we only show
            // "3 → 2 → 1 → Are you ready? → Ready your stance" once per module.
            proceedAfterTraining();
          }, 3000);
        });
    }
  }, [hasRecordedCompletion, module, poseCorrectReps, requiredReps, proceedAfterTraining, showTrainingFailed, step]);

  // Training timer: provide an end timestamp to PoseCameraView.
  // PoseCameraView updates the displayed time during its pose frame loop.
  useEffect(() => {
    if (step !== 'training_pose') return;
    if (!module) return;

    // Only start once per module.
    if (trainingTimerEpochRef.current === trainingIndex && trainingTimerEndTimeMs != null) return;
    trainingTimerEpochRef.current = trainingIndex;

    // Clamp to a sensible minimum so the timer is always visible and counts down.
    const rawDuration = module.trainingDurationSeconds ?? 30;
    const durationSeconds =
      typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0 ? Math.floor(rawDuration) : 30;

    setTrainingTimerEndTimeMs(Date.now() + durationSeconds * 1000);
  }, [module, step, trainingIndex, trainingTimerEndTimeMs]);

  const backButton = (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={confirmQuit}
      activeOpacity={0.85}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Image source={require('../assets/images/logouticon.png')} style={styles.iconButtonImage} />
    </TouchableOpacity>
  );

  const skipButton = (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={confirmSkip}
      activeOpacity={0.85}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Image source={require('../assets/images/icon-back.png')} style={[styles.iconButtonImage, styles.iconButtonImageSkip]} />
    </TouchableOpacity>
  );

  const skipConfirmModal = (
    <Modal transparent visible={showSkipConfirm} animationType="fade" onRequestClose={handleSkipNo}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Skip workout?</Text>
          <Text style={styles.modalMessage}>Are you sure?</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalNoButton} onPress={handleSkipNo}>
              <Text style={styles.modalNoText}>No</Text>
            </Pressable>
            <Pressable style={styles.modalYesButton} onPress={handleSkipYes}>
              <Text style={styles.modalYesText}>Yes</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const quitConfirmModal = (
    <Modal transparent visible={showQuitConfirm} animationType="fade" onRequestClose={handleQuitNo}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Quit session?</Text>
          <Text style={styles.modalMessage}>Are you sure you want to quit?</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalNoButton} onPress={handleQuitNo}>
              <Text style={styles.modalNoText}>No</Text>
            </Pressable>
            <Pressable style={styles.modalYesButton} onPress={handleQuitYes}>
              <Text style={styles.modalYesText}>Yes</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const trainingFailedModal = (
    <Modal transparent visible={showTrainingFailed} animationType="fade" onRequestClose={() => setShowTrainingFailed(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>FAILED</Text>
          <Text style={styles.modalMessage}>Do you want to try again?</Text>
          <View style={styles.modalActionsColumn}>
            <Pressable
              style={styles.modalPrimaryButton}
              onPress={() => {
                setShowTrainingFailed(false);
                handleRetryTraining();
              }}
            >
              <Text style={styles.modalPrimaryButtonText}>Retry</Text>
            </Pressable>
            <Pressable
              style={styles.modalOutlineButton}
              onPress={() => {
                setShowTrainingFailed(false);
                confirmQuit();
              }}
            >
              <Text style={styles.modalOutlineButtonText}>Quit</Text>
            </Pressable>
            <Pressable
              style={styles.modalOutlineButton}
              onPress={() => {
                setShowTrainingFailed(false);
                skipCurrentWorkout();
              }}
            >
              <Text style={styles.modalOutlineButtonText}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (step === 'session_done') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.sessionTitle}>Session Complete</Text>
          <Text style={styles.sessionSubtitle}>Nice work. You finished Warmup → Training → Cooldown.</Text>
          {backButton}
        </View>
        {skipConfirmModal}
        {quitConfirmModal}
      </SafeAreaView>
    );
  }

  if (step === 'training_safety') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <View style={styles.safetyCard}>
            <Text style={styles.safetyTitle}>Safety Protocol</Text>
            <Text style={styles.safetyIntro}>Please read and confirm the following before starting your training modules:</Text>

            <View style={styles.safetyList}>
              <Text style={styles.safetyItem}>• Ensure you have enough space to move safely with no obstacles.</Text>
              <Text style={styles.safetyItem}>• Warm up before practicing. Do not train if you feel unwell or injured.</Text>
              <Text style={styles.safetyItem}>• Train at your own risk and within your ability.</Text>
              <Text style={styles.safetyItem}>• If using camera-based features, make sure the area behind you is clear.</Text>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setHasShownTrainingSafety(true);
                setStep('training_countdown');
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'training_pose' && module) {
    const rawDuration = module.trainingDurationSeconds ?? 30;
    const durationSeconds =
      typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0 ? Math.floor(rawDuration) : 30;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{ flex: 1 }}>
          <PoseCameraView
            key={poseSessionKey}
            requiredReps={requiredReps}
            correctReps={poseCorrectReps}
            isCurrentRepCorrect={poseCurrentRepCorrect}
            onBack={confirmQuit}
            backLabel="Quit"
            showBackButton={false}
            trainingTimerText={formatTime(durationSeconds)}
            trainingTimerEndTimeMs={trainingTimerEndTimeMs}
            onTrainingTimerExpired={handleTrainingTimerExpired}
            onCorrectRepsUpdate={(count, lastCorrect) => {
              setPoseCorrectReps(count);
              setPoseCurrentRepCorrect(lastCorrect);
            }}
            referenceSequence={referencePoseSequence}
            poseFocus={referencePoseFocus}
            matchThreshold={matchThreshold}
            poseVariant="default"
            moduleId={module.moduleId}
            category={module.category && module.category.trim() ? module.category : category}
            showStartCountdown={false}
            showArmState={false}
            showOverlayHint={false}
          />
          <View style={styles.bottomControlsRow}>
            {backButton}
            {skipButton}
          </View>
        </View>
        {skipConfirmModal}
        {quitConfirmModal}
        {trainingFailedModal}
      </SafeAreaView>
    );
  }

  if (isFullScreenCountdownStep(step)) {
    const countdownLabel =
      step === 'warmup_countdown' || step === 'warmup_between_countdown'
        ? 'Warmup'
        : step === 'cooldown_countdown' || step === 'cooldown_between_countdown'
          ? 'Cool Down'
          : 'Training';
    const isTrainingStanceStep = step === 'training_stance' || step === 'training_between_stance';
    const trainingStanceSource = require('../assets/images/guides/side fighting stance gif.gif');
    const isNumericCountdown = countdownText === '3' || countdownText === '2' || countdownText === '1';
    const isSuccessStep = step === 'training_success';
    const hideControls =
      isTrainingStanceStep || isNumericCountdown || countdownText === 'ARE YOU READY?' || countdownText === 'GO!!';

    return (
      <SafeAreaView style={styles.safeArea}>
        {!hideControls && !isSuccessStep && (
          <View style={styles.floatingControlsRow}>
            {backButton}
            {skipButton}
          </View>
        )}
        <View style={styles.fullCountdownBody}>
          {isSuccessStep ? (
            <Text style={[styles.fullCountdownText, styles.fullCountdownTextNumeric]} adjustsFontSizeToFit numberOfLines={1}>
              GOOD JOB!
            </Text>
          ) : isTrainingStanceStep ? (
            <View style={styles.stancePageWrap}>
              <Image source={trainingStanceSource} style={styles.stanceCenterGif} resizeMode="contain" />
              <Text style={styles.stancePageText}>READY YOUR STANCE</Text>
            </View>
          ) : (
            <Text
              style={[styles.fullCountdownText, isNumericCountdown ? styles.fullCountdownTextNumeric : null]}
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              {countdownText}
            </Text>
          )}
        </View>
        {skipConfirmModal}
        {quitConfirmModal}
      </SafeAreaView>
    );
  }

  const showTimer = step === 'warmup_timer' || step === 'cooldown_timer';

  const topSectionTitle =
    step === 'warmup_timer' ? `Warmup` : step === 'cooldown_timer' ? `Cool Down` : 'Training';

  const cooldownStretchMessage = 'Take a moment to stretch and cool down.';

  const activeGuideSource =
    step === 'warmup_timer'
      ? getWarmupGuideSource(activeExerciseName)
      : step === 'cooldown_timer'
        ? getCooldownGuideSource(activeExerciseName)
        : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.floatingControlsRow}>
        {backButton}
        {skipButton}
      </View>

      {step === 'training_pose_loading' && (
        <View style={styles.activeBody}>
          <Text style={styles.exerciseTitleLarge}>{currentTrainingItem?.moduleTitle ?? 'Training module'}</Text>
          <Text style={styles.trainingHint}>Preparing pose reference and starting camera…</Text>
          <ActivityIndicator size="large" color="#07bbc0" style={{ marginTop: 24 }} />
          {poseLoadingError ? <Text style={styles.errorText}>{poseLoadingError}</Text> : null}
        </View>
      )}

      {(step === 'warmup_timer' || step === 'cooldown_timer') && (
        <View style={styles.activeBody}>
          <Text style={styles.exerciseTitleLarge}>{activeExerciseName}</Text>
          {step === 'cooldown_timer' ? <Text style={styles.cooldownStretchText}>{cooldownStretchMessage}</Text> : null}

          {activeGuideSource ? (
            <Image source={activeGuideSource} style={styles.gifImageLarge} resizeMode="contain" />
          ) : mannequinGifUri ? (
            <Image source={{ uri: mannequinGifUri }} style={styles.gifImageLarge} resizeMode="contain" />
          ) : (
            <View style={styles.gifPlaceholderFlat}>
              <Text style={styles.gifPlaceholderText}>Guide</Text>
            </View>
          )}

          {showTimer ? (
            <View style={styles.timerBlock}>
              <Text style={styles.timerTextLarge}>{formatTime(timerRemainingSeconds)}</Text>
              <Text style={styles.timerLabel}>time left</Text>
            </View>
          ) : null}
        </View>
      )}
      {skipConfirmModal}
      {quitConfirmModal}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  floatingControlsRow: {
    position: 'absolute',
    // Bottom placement for nicer composition.
    // Align with PoseCameraView overlay block (timer/rep area).
    bottom: 60,
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(1, 31, 54, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.25)',
  },
  iconButtonImage: { width: 22, height: 22, tintColor: '#07bbc0', opacity: 0.95 },
  // Reuse the back icon, flipped to point right, for "Skip".
  iconButtonImageSkip: { transform: [{ rotate: '180deg' }] },
  bottomControlsRow: {
    position: 'absolute',
    // Align with PoseCameraView overlay block (timer/rep area).
    bottom: 60,
    left: 16,
    right: 16,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeBody: { flex: 1, paddingHorizontal: 20, paddingTop: 26 },
  exerciseTitleLarge: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 42,
    marginBottom: 8,
  },
  cooldownStretchText: { color: '#6b8693', fontSize: 15, marginBottom: 12, textAlign: 'center', lineHeight: 22 },
  trainingHint: { color: '#6b8693', fontSize: 15, textAlign: 'center', marginTop: 8 },
  errorText: { color: '#ff6b6b', fontSize: 13, marginTop: 16, textAlign: 'center' },
  gifImageLarge: {
    width: '100%',
    height: 300,
    alignSelf: 'center',
    marginTop: 36,
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  gifPlaceholderFlat: {
    height: 300,
    alignSelf: 'center',
    marginTop: 36,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gifPlaceholderText: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 14 },
  timerBlock: { alignItems: 'center', paddingBottom: 8, paddingTop: 0, marginTop: 28 },
  timerTextLarge: { color: '#07bbc0', fontSize: 72, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 10 },
  timerLabel: { color: '#6b8693', fontSize: 16, marginTop: 8 },
  fullCountdownBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 92,
    overflow: 'hidden',
  },
  stancePageWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  stanceCenterGif: {
    width: '88%',
    height: 360,
    marginBottom: 14,
  },
  stancePageText: {
    color: '#FFF',
    fontSize: 40,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  fullCountdownText: {
    color: '#FFF',
    fontSize: 64,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  fullCountdownTextNumeric: {
    fontSize: 92,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 10 },
  sessionTitle: { color: '#07bbc0', fontSize: 22, fontWeight: '900' },
  sessionSubtitle: { color: '#6b8693', fontSize: 14, textAlign: 'center' },
  safetyCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#011f36',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#0a3645',
  },
  safetyTitle: { color: '#07bbc0', fontSize: 20, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  safetyIntro: { color: '#FFF', fontSize: 14, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  safetyList: { marginBottom: 18 },
  safetyItem: { color: '#6b8693', fontSize: 14, marginBottom: 10, lineHeight: 22 },
  primaryButton: { backgroundColor: '#07bbc0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryButtonText: { color: '#041527', fontSize: 16, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#011f36',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#0a3645',
    padding: 20,
  },
  modalTitle: { color: '#07bbc0', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  modalMessage: { color: '#d6e6ee', fontSize: 15, textAlign: 'center', marginTop: 10, marginBottom: 18 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalActionsColumn: { flexDirection: 'column', gap: 10, marginTop: 8 },
  modalNoButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#07bbc0',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalNoText: { color: '#07bbc0', fontWeight: '700', fontSize: 15 },
  modalYesButton: {
    flex: 1,
    backgroundColor: '#07bbc0',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalYesText: { color: '#041527', fontWeight: '800', fontSize: 15 },
  modalPrimaryButton: { width: '100%', backgroundColor: '#07bbc0', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  modalPrimaryButtonText: { color: '#041527', fontWeight: '800', fontSize: 15 },
  modalOutlineButton: { width: '100%', borderWidth: 1.5, borderColor: '#07bbc0', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  modalOutlineButtonText: { color: '#07bbc0', fontWeight: '700', fontSize: 15 },
});

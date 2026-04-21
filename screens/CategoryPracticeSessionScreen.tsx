import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
import { Audio, ResizeMode, Video } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthController, type ModuleItem } from '../lib/controllers/AuthController';
import type { Module } from '../lib/models/Module';
import type { PoseFocus, PoseFrame, PoseSequence } from '../lib/pose/types';
import { DEFAULT_MATCH_THRESHOLD, PUNCHING_MATCH_THRESHOLD } from '../lib/pose/comparator';
import { DEFAULT_POSE_FOCUS } from '../lib/pose/types';
import PoseCameraView from '../components/PoseCameraView';
import SessionNavMenu from '../components/SessionNavMenu';
import { getRequiredReps } from '../utils/repRange';
import { getCooldownGuideSource, getWarmupGuideSource } from '../lib/warmupGuideAssets';
import { TrainingGuidePreloader, TrainingPoseGuideOverlay, type TrainingGuideModuleFields } from '../lib/trainingGuideMedia';
import { getPurchasedModuleIds, getUserCreditsBalance, purchaseModulesWithCredits } from '../lib/controllers/modulePurchases';
import { getCachedVideoUri, prefetchVideo } from '../utils/videoCache';

type SessionStep =
  | 'warmup_countdown'
  | 'warmup_timer'
  | 'warmup_between_countdown'
  | 'training_introduction'
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
const SESSION_LOOP_TRACK = require('../assets/audio/training-loop.mp3');
const TRAINING_MUSIC_MUTED_KEY = 'trainingModeMusicMuted';

export interface CategoryPracticeSessionScreenProps {
  category: string;
  warmups: string[];
  cooldowns: string[];
  trainingModules: ModuleItem[];
  introductionVideoUrl?: string | null;
  startPhase?: 'warmup' | 'cooldown' | 'introduction';
  mannequinGifUri?: string | null;
  /**
   * Recommended pick: same countdown → pose flow; **no** previous/skip or pose back button.
   * Quit (top-left) stays available so users can leave the session.
   */
  sessionVariant?: 'default' | 'recommendedSingle';
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
  introductionVideoUrl = null,
  startPhase = 'warmup',
  mannequinGifUri,
  sessionVariant = 'default',
  onExit,
}: CategoryPracticeSessionScreenProps) {
  const hideSessionNav = sessionVariant === 'recommendedSingle';
  const [step, setStep] = useState<SessionStep>('warmup_countdown');
  const stepRef = useRef<SessionStep>('warmup_countdown');
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

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
  const loopSoundRef = useRef<Audio.Sound | null>(null);

  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(30);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** When true, warmup/cooldown 30s interval does not decrement (pause). */
  const segmentTimerPauseRef = useRef(false);
  const hasInitializedSessionRef = useRef(false);

  const hasRecordedCompletionRef = useRef(false);
  /** Synchronous guard: training timer expiry vs rep effect must not skip GOOD JOB + completion write. */
  const trainingSuccessLatchRef = useRef(false);
  // Prevent restarting the timer interval on re-renders while still on `training_pose`.
  const trainingTimerEpochRef = useRef<number>(-1);
  const [trainingTimerEndTimeMs, setTrainingTimerEndTimeMs] = useState<number | null>(null);
  const [trainingPaused, setTrainingPaused] = useState(false);
  const [frozenTrainingTimerText, setFrozenTrainingTimerText] = useState<string | null>(null);
  const pauseRemainingMsRef = useRef(0);
  const [segmentTimerPaused, setSegmentTimerPaused] = useState(false);
  const [trainingMusicMuted, setTrainingMusicMuted] = useState(false);

  const currentTrainingItem = trainingModules[trainingIndex] ?? null;
  const [module, setModule] = useState<Module | null>(null);

  const introVideoUrl = useMemo(() => {
    return String(
      introductionVideoUrl
        ?? trainingModules[0]?.techniqueVideoUrl
        ?? trainingModules[0]?.introductionVideoUrl
        ?? ''
    ).trim();
  }, [introductionVideoUrl, trainingModules]);
  const [introVideoLocalUri, setIntroVideoLocalUri] = useState<string | null>(null);
  const introVideoRef = useRef<Video | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!introVideoUrl) {
      setIntroVideoLocalUri(null);
      return () => {
        cancelled = true;
      };
    }
    prefetchVideo(introVideoUrl);
    (async () => {
      try {
        const localUri = await getCachedVideoUri(introVideoUrl);
        if (cancelled) return;
        setIntroVideoLocalUri(localUri || null);
      } catch {
        if (!cancelled) setIntroVideoLocalUri(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [introVideoUrl]);

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
  const pendingCompletionWritesRef = useRef<Set<Promise<unknown>>>(new Set());
  const exitRequestedRef = useRef(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [showPreviousConfirm, setShowPreviousConfirm] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [hasShownTrainingIntroduction, setHasShownTrainingIntroduction] = useState(false);
  const [hasShownTrainingSafety, setHasShownTrainingSafety] = useState(false);
  const [showTrainingFailed, setShowTrainingFailed] = useState(false);
  /** True after timer failure until Retry / Skip / Quit / leave training — keeps pose + reps frozen even if the fail modal is dismissed. */
  const [trainingDefeatLocked, setTrainingDefeatLocked] = useState(false);
  const showTrainingFailedRef = useRef(false);
  const trainingDefeatLockedRef = useRef(false);
  useEffect(() => {
    showTrainingFailedRef.current = showTrainingFailed;
  }, [showTrainingFailed]);
  useEffect(() => {
    trainingDefeatLockedRef.current = trainingDefeatLocked;
  }, [trainingDefeatLocked]);
  const [purchasedModuleIds, setPurchasedModuleIds] = useState<string[]>([]);
  const [userCredits, setUserCredits] = useState(0);
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [pendingLockedTrainingIndex, setPendingLockedTrainingIndex] = useState<number | null>(null);
  const queuedCategoryReviewPromptRef = useRef(false);
  const maybeQueueCategoryReviewPromptRef = useRef<() => Promise<boolean>>(async () => false);

  useEffect(() => {
    queuedCategoryReviewPromptRef.current = false;
  }, [category]);

  const requiredReps = module ? getRequiredReps(module.repRange) : 0;
  const matchThreshold = referencePoseFocus === 'punching' ? PUNCHING_MATCH_THRESHOLD : DEFAULT_MATCH_THRESHOLD;
  const isTrainingModuleLocked = useCallback(
    (index: number) => {
      // first module in category stays free
      if (index === 0) return false;
      const mod = trainingModules[index];
      if (!mod) return false;
      return !purchasedModuleIds.includes(mod.moduleId);
    },
    [purchasedModuleIds, trainingModules]
  );

  const trainersInSession = useMemo(() => {
    const byId = new Map<string, string>();
    for (const mod of trainingModules as unknown as Array<Record<string, unknown>>) {
      const uid = String(
        mod.trainerId ?? mod.trainerUid ?? mod.trainerUID ?? mod.ownerId ?? mod.userId ?? ''
      ).trim();
      const name = String(mod.trainerName ?? mod.trainerDisplayName ?? mod.authorName ?? '').trim();
      if (!uid) continue;
      if (!byId.has(uid)) byId.set(uid, name || 'Trainer');
    }
    return Array.from(byId.entries()).map(([uid, name]) => ({ uid, name }));
  }, [trainingModules]);

  const resolveTrainersFromModuleDocs = useCallback(async (): Promise<Array<{ uid: string; name: string }>> => {
    const ids = Array.from(new Set(trainingModules.map((m) => m.moduleId).filter(Boolean)));
    if (!ids.length) return [];
    const byId = new Map<string, string>();
    await Promise.all(
      ids.map(async (moduleId) => {
        const full = await AuthController.getModuleByIdForUser(moduleId);
        if (!full) return;
        const uid = String((full as unknown as { trainerId?: string }).trainerId ?? '').trim();
        const name = String((full as unknown as { trainerName?: string }).trainerName ?? '').trim();
        if (!uid) return;
        if (!byId.has(uid)) byId.set(uid, name || 'Trainer');
      })
    );
    return Array.from(byId.entries()).map(([uid, name]) => ({ uid, name }));
  }, [trainingModules]);

  const maybeQueueCategoryReviewPrompt = useCallback(async (): Promise<boolean> => {
    if (queuedCategoryReviewPromptRef.current) return false;
    let trainers = trainersInSession;
    if (trainers.length === 0) {
      trainers = await resolveTrainersFromModuleDocs();
    }
    if (trainers.length === 0) return false;
    const existing = await AuthController.getMyCategoryReview(category);
    if (existing) return false;
    await AuthController.queueCategoryReviewPrompt({ category, trainers });
    queuedCategoryReviewPromptRef.current = true;
    return true;
  }, [category, trainersInSession, resolveTrainersFromModuleDocs]);

  useEffect(() => {
    maybeQueueCategoryReviewPromptRef.current = () => maybeQueueCategoryReviewPrompt();
  }, [maybeQueueCategoryReviewPrompt]);

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

  /** One failure increment per training module attempt (timer fail or skip before rep goal). */
  const trainingFailureLoggedRef = useRef(false);
  useEffect(() => {
    trainingFailureLoggedRef.current = false;
  }, [trainingIndex]);

  const logTrainingFailureOnce = useCallback(() => {
    const m = moduleRef.current;
    if (!m?.moduleId || trainingFailureLoggedRef.current) return;
    trainingFailureLoggedRef.current = true;
    AuthController.recordModuleTrainingFailure(m.moduleId).catch(() => {});
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(TRAINING_MUSIC_MUTED_KEY)
      .then((raw) => {
        if (cancelled) return;
        setTrainingMusicMuted(raw === '1');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const stopLoopMusic = async () => {
    const snd = loopSoundRef.current;
    if (!snd) return;
    try {
      await snd.pauseAsync();
    } catch {}
  };

  const startLoopMusic = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });
      if (!loopSoundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          SESSION_LOOP_TRACK,
          { shouldPlay: false, isLooping: true, volume: 0.42 }
        );
        loopSoundRef.current = sound;
      }
      await loopSoundRef.current.playAsync();
    } catch {}
  };

  const startTimer = (seconds: number, onDone: () => void) => {
    clearTimer();
    segmentTimerPauseRef.current = false;
    setSegmentTimerPaused(false);
    setTimerRemainingSeconds(seconds);
    timerIntervalRef.current = setInterval(() => {
      if (segmentTimerPauseRef.current) return;
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

  const recordCompletionInBackground = useCallback((moduleId: string) => {
    const id = String(moduleId ?? '').trim();
    if (!id) return;
    const write = AuthController.recordModuleCompletion(id)
      .catch(() => {})
      .finally(() => {
        pendingCompletionWritesRef.current.delete(write);
      });
    pendingCompletionWritesRef.current.add(write);
  }, []);

  const exitSession = useCallback(async () => {
    if (exitRequestedRef.current) return;
    exitRequestedRef.current = true;
    const pending = Array.from(pendingCompletionWritesRef.current);
    if (pending.length > 0) await Promise.allSettled(pending);
    const s = stepRef.current;
    const inTraining =
      s === 'training_introduction' ||
      s === 'training_safety' ||
      s === 'training_countdown' ||
      s === 'training_stance' ||
      s === 'training_pose_loading' ||
      s === 'training_pose' ||
      s === 'training_success' ||
      s === 'training_between_countdown' ||
      s === 'training_between_stance';
    if (inTraining) {
      try {
        await maybeQueueCategoryReviewPromptRef.current();
      } catch {
        // non-fatal
      }
    }
    onExit();
  }, [onExit]);

  const exitTrainingToCooldownOrDone = useCallback(() => {
    if (cooldownNames.length > 0) {
      setCooldownIndex(0);
      setActiveExerciseName(cooldownNames[0] ?? '');
      setStep('cooldown_countdown');
    } else if (hideSessionNav) {
      void exitSession();
    } else {
      setStep('session_done');
    }
  }, [cooldownNames, hideSessionNav, exitSession]);

  const startTrainingCountdown = useCallback(
    (index: number) => {
      if (isTrainingModuleLocked(index)) {
        setPendingLockedTrainingIndex(index);
        setPurchaseModalVisible(true);
        return;
      }
      setTrainingIndex(index);
      // Show the category introduction video once before safety.
      if (index === 0 && !hasShownTrainingIntroduction && introVideoUrl) {
        setStep('training_introduction');
        return;
      }
      // Show safety protocol exactly once: before the first training module countdown.
      if (index === 0 && !hasShownTrainingSafety) setStep('training_safety');
      else setStep('training_countdown');
    },
    [hasShownTrainingIntroduction, hasShownTrainingSafety, introVideoUrl, isTrainingModuleLocked]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [purchased, liveCredits] = await Promise.all([
        getPurchasedModuleIds(),
        getUserCreditsBalance(),
      ]);
      if (cancelled) return;
      setUserCredits(liveCredits);
      setPurchasedModuleIds(purchased);
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

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
      const slim = currentTrainingItem as ModuleItem;
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
        referenceGuideUrl: slim.referenceGuideUrl,
        trainingDurationSeconds: slim.trainingDurationSeconds,
      } as unknown as Module);
      setIsTrainingPrepared(true);
    }
  }, [category, currentTrainingItem, exitTrainingToCooldownOrDone]);

  const proceedAfterTraining = useCallback(() => {
    trainingSuccessLatchRef.current = false;
    setHasRecordedCompletion(false);
    setShowTrainingFailed(false);
    setTrainingDefeatLocked(false);
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

  const commitTrainingSuccess = useCallback(() => {
    const mod = moduleRef.current;
    const mid = mod?.moduleId ? String(mod.moduleId).trim() : '';
    if (!mid) return;
    if (trainingSuccessLatchRef.current) return;
    trainingSuccessLatchRef.current = true;
    hasRecordedCompletionRef.current = true;
    setHasRecordedCompletion(true);
    clearSuccessTimeout();
    setStep('training_success');
    recordCompletionInBackground(mid);
    successTimeoutRef.current = setTimeout(() => {
      proceedAfterTraining();
    }, 3000);
  }, [recordCompletionInBackground, proceedAfterTraining]);

  const handleTrainingTimerExpired = useCallback(() => {
    if (trainingSuccessLatchRef.current) return;
    if (showTrainingFailedRef.current || trainingDefeatLockedRef.current) return;
    const required = requiredRepsRef.current;
    const achieved = poseCorrectRepsRef.current;
    if (required > 0 && achieved < required) {
      logTrainingFailureOnce();
      setTrainingTimerEndTimeMs(null);
      trainingDefeatLockedRef.current = true;
      setTrainingDefeatLocked(true);
      setShowTrainingFailed(true);
      return;
    }
    commitTrainingSuccess();
  }, [commitTrainingSuccess, logTrainingFailureOnce]);

  const skipCurrentWorkout = useCallback(() => {
    clearCountdown();
    clearTimer();
    clearSuccessTimeout();
    setShowTrainingFailed(false);
    setTrainingDefeatLocked(false);
    trainingTimerEpochRef.current = -1;
    setTrainingTimerEndTimeMs(null);

    if (step === 'training_introduction') {
      setHasShownTrainingIntroduction(true);
      if (!hasShownTrainingSafety) {
        setStep('training_safety');
      } else {
        setStep('training_countdown');
      }
      return;
    }

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
      if (
        (step === 'training_pose' ||
          step === 'training_between_countdown' ||
          step === 'training_between_stance') &&
        !hasRecordedCompletionRef.current
      ) {
        const mod = moduleRef.current;
        if (mod) {
          const req = getRequiredReps(mod.repRange);
          if (req > 0 && poseCorrectRepsRef.current < req) {
            logTrainingFailureOnce();
          }
        }
      }
      trainingPrepRequestRef.current += 1;
      trainingSuccessLatchRef.current = false;
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
      } else if (hideSessionNav) {
        void exitSession();
      } else {
        setStep('session_done');
      }
    }
  }, [
    cooldownIndex,
    cooldownNames,
    exitTrainingToCooldownOrDone,
    hasShownTrainingIntroduction,
    hasShownTrainingSafety,
    hideSessionNav,
    logTrainingFailureOnce,
    exitSession,
    step,
    startTrainingCountdown,
    trainingIndex,
    trainingModules.length,
    warmupIndex,
    warmupNames,
  ]);

  const handleRetryTraining = useCallback(() => {
    // Retry the same module: reset pose evaluation counters + timer, then restart pose loading.
    trainingDefeatLockedRef.current = false;
    setShowTrainingFailed(false);
    setTrainingDefeatLocked(false);
    trainingSuccessLatchRef.current = false;
    setHasRecordedCompletion(false);
    clearSuccessTimeout();
    setPoseCorrectReps(0);
    setPoseCurrentRepCorrect(null);
    trainingTimerEpochRef.current = -1;
    setTrainingTimerEndTimeMs(null);
    setTrainingPaused(false);
    setFrozenTrainingTimerText(null);
    // Force PoseCameraView remount to reset its internal state.
    setPoseSessionKey((k) => k + 1);
    // Go back to module's pose phase without changing trainingIndex.
    setStep('training_pose_loading');
  }, []);

  const toggleTrainingPosePause = useCallback(() => {
    if (!trainingPaused) {
      if (trainingTimerEndTimeMs == null) return;
      const rem = Math.max(0, trainingTimerEndTimeMs - Date.now());
      pauseRemainingMsRef.current = rem;
      setFrozenTrainingTimerText(formatTime(Math.ceil(rem / 1000)));
      setTrainingTimerEndTimeMs(null);
      setTrainingPaused(true);
    } else {
      setTrainingTimerEndTimeMs(Date.now() + pauseRemainingMsRef.current);
      setFrozenTrainingTimerText(null);
      setTrainingPaused(false);
    }
  }, [trainingPaused, trainingTimerEndTimeMs]);

  const toggleSegmentTimerPause = useCallback(() => {
    segmentTimerPauseRef.current = !segmentTimerPauseRef.current;
    setSegmentTimerPaused((p) => !p);
  }, []);

  const handleSessionMenuTogglePause = useCallback(() => {
    if (step === 'training_pose') {
      toggleTrainingPosePause();
    } else if (step === 'warmup_timer' || step === 'cooldown_timer') {
      toggleSegmentTimerPause();
    }
  }, [step, toggleTrainingPosePause, toggleSegmentTimerPause]);

  useEffect(() => {
    if (step !== 'training_pose') {
      setTrainingPaused(false);
      setFrozenTrainingTimerText(null);
      setTrainingDefeatLocked(false);
    }
    segmentTimerPauseRef.current = false;
    setSegmentTimerPaused(false);
  }, [step]);

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

  const goToPreviousWorkout = useCallback(() => {
    clearCountdown();
    clearTimer();
    clearSuccessTimeout();
    setShowTrainingFailed(false);
    setTrainingDefeatLocked(false);
    trainingTimerEpochRef.current = -1;
    setTrainingTimerEndTimeMs(null);
    trainingPrepRequestRef.current += 1;
    trainingSuccessLatchRef.current = false;
    setHasRecordedCompletion(false);
    setIsTrainingPrepared(false);
    setModule(null);
    const isWarmupStep = step === 'warmup_countdown' || step === 'warmup_timer' || step === 'warmup_between_countdown';
    const isTrainingStep =
      step === 'training_introduction' ||
      step === 'training_safety' ||
      step === 'training_countdown' ||
      step === 'training_stance' ||
      step === 'training_pose_loading' ||
      step === 'training_pose' ||
      step === 'training_success' ||
      step === 'training_between_countdown' ||
      step === 'training_between_stance';
    const isCooldownStep = step === 'cooldown_countdown' || step === 'cooldown_timer' || step === 'cooldown_between_countdown';

    if (isWarmupStep) {
      const prevWarmup = warmupIndex - 1;
      if (prevWarmup >= 0) {
        setWarmupIndex(prevWarmup);
        setActiveExerciseName(warmupNames[prevWarmup] ?? '');
        setStep('warmup_countdown');
        return;
      }
      // Already first warmup: restart first warmup.
      setWarmupIndex(0);
      setActiveExerciseName(warmupNames[0] ?? '');
      setStep('warmup_countdown');
      return;
    }

    if (isTrainingStep) {
      const prevTraining = trainingIndex - 1;
      if (prevTraining >= 0) {
        startTrainingCountdown(prevTraining);
        return;
      }
      // From first training module, jump back to last warmup if available.
      if (warmupNames.length > 0) {
        const lastWarmup = warmupNames.length - 1;
        setWarmupIndex(lastWarmup);
        setActiveExerciseName(warmupNames[lastWarmup] ?? '');
        setStep('warmup_countdown');
        return;
      }
      // No warmups: restart first training module.
      startTrainingCountdown(0);
      return;
    }

    if (isCooldownStep) {
      const prevCooldown = cooldownIndex - 1;
      if (prevCooldown >= 0) {
        setCooldownIndex(prevCooldown);
        setActiveExerciseName(cooldownNames[prevCooldown] ?? '');
        setStep('cooldown_countdown');
        return;
      }
      // From first cooldown, jump to last training if available.
      if (trainingModules.length > 0) {
        startTrainingCountdown(trainingModules.length - 1);
        return;
      }
      // Fallback: restart first cooldown.
      setCooldownIndex(0);
      setActiveExerciseName(cooldownNames[0] ?? '');
      setStep('cooldown_countdown');
      return;
    }

    // Session done / unknown: go to last available phase.
    if (cooldownNames.length > 0) {
      const lastCooldown = cooldownNames.length - 1;
      setCooldownIndex(lastCooldown);
      setActiveExerciseName(cooldownNames[lastCooldown] ?? '');
      setStep('cooldown_countdown');
      return;
    }
    if (trainingModules.length > 0) {
      startTrainingCountdown(trainingModules.length - 1);
      return;
    }
    if (warmupNames.length > 0) {
      const lastWarmup = warmupNames.length - 1;
      setWarmupIndex(lastWarmup);
      setActiveExerciseName(warmupNames[lastWarmup] ?? '');
      setStep('warmup_countdown');
    }
  }, [cooldownIndex, cooldownNames, startTrainingCountdown, step, trainingIndex, trainingModules.length, warmupIndex, warmupNames]);

  const handleSkipNo = useCallback(() => {
    setShowSkipConfirm(false);
  }, []);

  const handleSkipYes = useCallback(() => {
    setShowSkipConfirm(false);
    skipCurrentWorkout();
  }, [skipCurrentWorkout]);

  const handlePreviousNo = useCallback(() => {
    setShowPreviousConfirm(false);
  }, []);

  const handlePreviousYes = useCallback(() => {
    setShowPreviousConfirm(false);
    goToPreviousWorkout();
  }, [goToPreviousWorkout]);

  const handleQuitNo = useCallback(() => setShowQuitConfirm(false), []);
  const handleQuitYes = useCallback(() => {
    setShowQuitConfirm(false);
    setTrainingDefeatLocked(false);
    void exitSession();
  }, [exitSession]);

  const confirmQuit = useCallback(() => {
    setShowQuitConfirm(true);
  }, []);

  const confirmPrevious = useCallback(() => {
    setShowPreviousConfirm(true);
  }, []);

  // Android hardware back: show the quit-confirm modal instead of leaving the
  // session silently (which would discard any in-progress workout).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = (): boolean => {
      if (showQuitConfirm || showPreviousConfirm) {
        // Let the modal's onRequestClose handle it.
        return false;
      }
      setShowQuitConfirm(true);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [showQuitConfirm, showPreviousConfirm]);

  useEffect(() => {
    if (step !== 'session_done') return;
    void exitSession();
  }, [step, exitSession]);

  // Initialize session entry step.
  useEffect(() => {
    if (hasInitializedSessionRef.current) return;
    hasInitializedSessionRef.current = true;

    if (startPhase === 'introduction' && trainingModules.length > 0) {
      startTrainingCountdown(0);
      return;
    }

    if (startPhase === 'cooldown' && cooldownNames.length > 0) {
      setCooldownIndex(0);
      setActiveExerciseName(cooldownNames[0] ?? '');
      setStep('cooldown_countdown');
      return;
    }

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
  }, [cooldownNames, startPhase, trainingModules.length, warmupNames.length, startTrainingCountdown]);

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
        } else if (hideSessionNav) {
          void exitSession();
        } else {
          setStep('session_done');
        }
      });
    });
    return () => clearCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cooldownIndex, cooldownNames.length, hideSessionNav, exitSession]);

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
    const playLoop =
      !trainingMusicMuted &&
      (
        (step === 'warmup_timer' && !segmentTimerPaused) ||
        (step === 'cooldown_timer' && !segmentTimerPaused) ||
        (step === 'training_pose' && !trainingPaused)
      );
    if (playLoop) {
      startLoopMusic().catch(() => {});
    } else {
      stopLoopMusic().catch(() => {});
    }
  }, [step, trainingMusicMuted, trainingPaused, segmentTimerPaused]);

  useEffect(() => {
    return () => {
      const snd = loopSoundRef.current;
      loopSoundRef.current = null;
      if (!snd) return;
      snd.stopAsync().catch(() => {});
      snd.unloadAsync().catch(() => {});
    };
  }, []);

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
    if (showTrainingFailed || trainingDefeatLocked) return;
    if (poseCorrectReps >= requiredReps && requiredReps > 0) {
      commitTrainingSuccess();
    }
  }, [commitTrainingSuccess, module, poseCorrectReps, requiredReps, showTrainingFailed, trainingDefeatLocked, step]);

  // Training timer: provide an end timestamp to PoseCameraView.
  // PoseCameraView updates the displayed time during its pose frame loop.
  useEffect(() => {
    if (step !== 'training_pose') return;
    if (!module) return;
    if (trainingPaused) return;
    if (showTrainingFailed || trainingDefeatLocked) return;

    // Only start once per module.
    if (trainingTimerEpochRef.current === trainingIndex && trainingTimerEndTimeMs != null) return;
    trainingTimerEpochRef.current = trainingIndex;

    // Clamp to a sensible minimum so the timer is always visible and counts down.
    const rawDuration = module.trainingDurationSeconds ?? 30;
    const durationSeconds =
      typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0 ? Math.floor(rawDuration) : 30;

    setTrainingTimerEndTimeMs(Date.now() + durationSeconds * 1000);
  }, [module, step, trainingIndex, trainingTimerEndTimeMs, trainingPaused, showTrainingFailed, trainingDefeatLocked]);

  const guideFieldsForPreload = useMemo((): TrainingGuideModuleFields | null => {
    if (!currentTrainingItem) return null;
    const cat = currentTrainingItem.category?.trim() ? currentTrainingItem.category : category;
    return {
      moduleId: currentTrainingItem.moduleId,
      moduleTitle: currentTrainingItem.moduleTitle ?? null,
      category: cat,
      difficultyLevel: module?.difficultyLevel ?? currentTrainingItem.difficultyLevel ?? null,
      referenceGuideUrl: module?.referenceGuideUrl ?? currentTrainingItem.referenceGuideUrl ?? null,
    };
  }, [currentTrainingItem, category, module?.referenceGuideUrl, module?.moduleId, module?.difficultyLevel]);

  const trainGuidePreloadActive =
    guideFieldsForPreload != null &&
    (step === 'training_safety' ||
      step === 'training_countdown' ||
      step === 'training_stance' ||
      step === 'training_between_countdown' ||
      step === 'training_between_stance' ||
      step === 'training_pose_loading');

  const trainingGuidePreloadLayer =
    guideFieldsForPreload != null ? (
      <TrainingGuidePreloader module={guideFieldsForPreload} active={trainGuidePreloadActive} />
    ) : null;

  const sessionNav = useMemo(
    () => (
      <SessionNavMenu
        containerStyle={styles.sessionNavPosition}
        onQuit={confirmQuit}
        restartVisible={step === 'training_pose' && !!module && !trainingDefeatLocked}
        onRestart={step === 'training_pose' && module ? handleRetryTraining : undefined}
        pauseVisible={
          (((step === 'training_pose' && !!module) || step === 'warmup_timer' || step === 'cooldown_timer') &&
            !trainingDefeatLocked)
        }
        paused={step === 'training_pose' ? trainingPaused : segmentTimerPaused}
        onTogglePause={
          (step === 'training_pose' && module) || step === 'warmup_timer' || step === 'cooldown_timer'
            ? handleSessionMenuTogglePause
            : undefined
        }
      />
    ),
    [
      step,
      module,
      trainingPaused,
      segmentTimerPaused,
      trainingDefeatLocked,
      confirmQuit,
      handleRetryTraining,
      handleSessionMenuTogglePause,
    ]
  );

  const previousButton = (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={confirmPrevious}
      activeOpacity={0.85}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Image source={require('../assets/images/icon-back.png')} style={styles.iconButtonImage} />
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

  const previousConfirmModal = (
    <Modal transparent visible={showPreviousConfirm} animationType="fade" onRequestClose={handlePreviousNo}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Previous workout?</Text>
          <Text style={styles.modalMessage}>Are you sure you want to go back to the previous workout?</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalNoButton} onPress={handlePreviousNo}>
              <Text style={styles.modalNoText}>No</Text>
            </Pressable>
            <Pressable style={styles.modalYesButton} onPress={handlePreviousYes}>
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
                setTrainingDefeatLocked(false);
                confirmQuit();
              }}
            >
              <Text style={styles.modalOutlineButtonText}>Quit</Text>
            </Pressable>
            <Pressable
              style={styles.modalOutlineButton}
              onPress={() => {
                setShowTrainingFailed(false);
                setTrainingDefeatLocked(false);
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

  const categoryBundlePrice = Math.max(
    0,
    trainingModules.filter((_, idx) => idx > 0 && !purchasedModuleIds.includes(trainingModules[idx].moduleId)).length * 50
  );
  const purchaseModal = (
    <Modal transparent visible={purchaseModalVisible} animationType="fade" onRequestClose={() => setPurchaseModalVisible(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.paywallCard}>
          <Text style={styles.paywallEyebrow}>LIMITED ACCESS</Text>
          <Text style={styles.paywallTitle}>Unlock Pro Training</Text>
          <Text style={styles.paywallSub}>
            This next module is premium. Unlock this module now, or unlock the rest of this training path in one go.
          </Text>
          <View style={styles.paywallPriceBox}>
            <Text style={styles.paywallPriceLabel}>Your balance</Text>
            <Text style={styles.paywallCreditsValue}>{userCredits} credits</Text>
          </View>
          <View style={styles.modalActionsColumn}>
            <Pressable
              style={[styles.paywallPrimaryButton, (purchasing || userCredits < 50) && styles.modalDisabled]}
              disabled={purchasing || userCredits < 50}
              onPress={async () => {
                const idx = pendingLockedTrainingIndex;
                if (idx == null) return;
                const target = trainingModules[idx];
                if (!target) return;
                try {
                  setPurchasing(true);
                  const result = await purchaseModulesWithCredits({
                    purchaseType: 'single',
                    category: target.category ?? category,
                    moduleIdsToPurchase: [target.moduleId],
                    amountCredits: 50,
                    moduleId: target.moduleId,
                    moduleTitle: target.moduleTitle,
                  });
                  setPurchasedModuleIds((prev) => Array.from(new Set([...prev, ...result.purchasedModuleIds])));
                  setUserCredits(result.newCredits);
                  setPurchaseModalVisible(false);
                  setTrainingIndex(idx);
                  setStep('training_countdown');
                } catch (e) {
                  Alert.alert('Purchase failed', (e as Error)?.message || 'Purchase could not be completed.');
                } finally {
                  setPurchasing(false);
                }
              }}
            >
              <Text style={styles.paywallPrimaryButtonText}>{purchasing ? 'Processing...' : 'Unlock This Module - 50 Credits'}</Text>
            </Pressable>
            <Pressable
              style={[styles.paywallSecondaryButton, (purchasing || categoryBundlePrice <= 0 || userCredits < categoryBundlePrice) && styles.modalDisabled]}
              disabled={purchasing || categoryBundlePrice <= 0 || userCredits < categoryBundlePrice}
              onPress={async () => {
                const remaining = trainingModules.filter((m, idx) => idx > 0 && !purchasedModuleIds.includes(m.moduleId));
                const price = remaining.length * 50;
                if (price <= 0) return;
                try {
                  setPurchasing(true);
                  const result = await purchaseModulesWithCredits({
                    purchaseType: 'category',
                    category,
                    moduleIdsToPurchase: remaining.map((m) => m.moduleId),
                    amountCredits: price,
                  });
                  setPurchasedModuleIds((prev) => Array.from(new Set([...prev, ...result.purchasedModuleIds])));
                  setUserCredits(result.newCredits);
                  const idx = pendingLockedTrainingIndex;
                  setPurchaseModalVisible(false);
                  if (idx != null) {
                    setTrainingIndex(idx);
                    setStep('training_countdown');
                  }
                } catch (e) {
                  Alert.alert('Purchase failed', (e as Error)?.message || 'Purchase could not be completed.');
                } finally {
                  setPurchasing(false);
                }
              }}
            >
              <Text style={styles.paywallSecondaryButtonText}>
                {purchasing ? 'Processing...' : `Unlock Entire Module - ${categoryBundlePrice} Credits`}
              </Text>
            </Pressable>
            <Pressable
              style={styles.paywallClose}
              onPress={() => {
                if (purchasing) return;
                setPurchaseModalVisible(false);
                void exitSession();
              }}
            >
              <Text style={styles.paywallCloseText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (step === 'session_done') {
    return (
      <SafeAreaView style={styles.safeArea}>
        {sessionNav}
        <View style={styles.center}>
          <Text style={styles.sessionTitle}>Session Complete</Text>
          <Text style={styles.sessionSubtitle}>Nice work. You finished Warmup → Training → Cooldown.</Text>
        </View>
        {skipConfirmModal}
        {previousConfirmModal}
        {quitConfirmModal}
      </SafeAreaView>
    );
  }

  if (step === 'training_safety') {
    return (
      <SafeAreaView style={styles.safeArea}>
        {trainingGuidePreloadLayer}
        {sessionNav}
        <View style={styles.center}>
          <View style={styles.safetyCard}>
            <Text style={styles.safetyTitle}>Safety Protocol</Text>
            <Text style={styles.safetyIntro}>Please read and confirm the following before starting your training modules:</Text>

            <View style={styles.safetyList}>
              <Text style={styles.safetyItem}>• Ensure you have enough space to move safely with no obstacles.</Text>
              <Text style={styles.safetyItem}>• Warm up before practicing. Do not train if you feel unwell or injured.</Text>
              <Text style={styles.safetyItem}>• Train at your own risk and within your ability.</Text>
              <Text style={styles.safetyItem}>• If using camera-based features, make sure the area behind you is clear.</Text>
              <Text style={styles.safetyItem}>• Stand about 2–3 meters from your phone and keep your full body in frame so reps can be detected correctly.</Text>
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
        {quitConfirmModal}
      </SafeAreaView>
    );
  }

  if (step === 'training_introduction') {
    const playbackUri = introVideoLocalUri || introVideoUrl;
    return (
      <SafeAreaView style={styles.safeArea}>
        {trainingGuidePreloadLayer}
        {sessionNav}
        <View style={styles.center}>
          <View style={styles.safetyCard}>
            <Text style={styles.safetyTitle}>Introduction</Text>
            <Text style={styles.safetyIntro}>Watch this introduction before starting your training modules.</Text>
            {playbackUri ? (
              <View style={styles.introductionVideoWrap}>
                <Video
                  key={playbackUri}
                  ref={(r) => { introVideoRef.current = r; }}
                  source={{ uri: playbackUri }}
                  style={styles.introductionVideo}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping={false}
                  onLoad={() => {
                    introVideoRef.current?.playAsync().catch(() => {});
                  }}
                />
              </View>
            ) : (
              <Text style={styles.safetyIntro}>No introduction video available for this category.</Text>
            )}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setHasShownTrainingIntroduction(true);
                if (!hasShownTrainingSafety) {
                  setStep('training_safety');
                } else {
                  setStep('training_countdown');
                }
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
        {quitConfirmModal}
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
            onBack={hideSessionNav ? () => {} : confirmQuit}
            backLabel="Quit"
            showBackButton={false}
            trainingTimerText={
              trainingDefeatLocked
                ? '0:00'
                : trainingPaused && frozenTrainingTimerText != null
                  ? frozenTrainingTimerText
                  : formatTime(durationSeconds)
            }
            trainingTimerEndTimeMs={trainingPaused || trainingDefeatLocked ? null : trainingTimerEndTimeMs}
            onTrainingTimerExpired={handleTrainingTimerExpired}
            paused={trainingPaused || trainingDefeatLocked}
            onCorrectRepsUpdate={(count, lastCorrect) => {
              if (trainingDefeatLocked) return;
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
            suppressBottomPoseHint
            showOverlayHint={false}
          />
          <TrainingPoseGuideOverlay
            module={{
              moduleId: module.moduleId,
              moduleTitle: module.moduleTitle,
              category: module.category && module.category.trim() ? module.category : category,
              difficultyLevel: module.difficultyLevel ?? null,
              referenceGuideUrl: module.referenceGuideUrl,
            }}
            wrapStyle={styles.trainingPoseGuideWrap}
          />
          {!hideSessionNav ? (
            <View style={styles.bottomControlsRow}>
              {previousButton}
              {skipButton}
            </View>
          ) : null}
        </View>
        {sessionNav}
        {skipConfirmModal}
        {previousConfirmModal}
        {quitConfirmModal}
        {trainingFailedModal}
        {purchaseModal}
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
    const moduleStancePosition = String(
      (module as any)?.stancePosition ?? (currentTrainingItem as any)?.stancePosition ?? ''
    ).trim().toLowerCase();
    const isFrontViewStance = moduleStancePosition === 'front view' || moduleStancePosition === 'frontview';
    const trainingStanceSource = isFrontViewStance
      ? require('../assets/images/Facing front.gif')
      : require('../assets/images/guides/side fighting stance gif.gif');
    const isNumericCountdown = countdownText === '3' || countdownText === '2' || countdownText === '1';
    const isSuccessStep = step === 'training_success';
    const hideControls =
      isTrainingStanceStep ||
      isNumericCountdown ||
      countdownText === 'ARE YOU READY?' ||
      countdownText === 'GO!!';
    const hideQuitButton =
      isTrainingStanceStep ||
      isNumericCountdown ||
      countdownText === 'ARE YOU READY?' ||
      countdownText === 'GO!!';

    return (
      <SafeAreaView style={styles.safeArea}>
        {trainingGuidePreloadLayer}
        {!hideControls && !isSuccessStep && (
          <View style={styles.floatingControlsRow}>
            {previousButton}
            {skipButton}
          </View>
        )}
        {!hideQuitButton ? <View style={styles.topLeftOverlay}>{sessionNav}</View> : null}
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
        {previousConfirmModal}
        {quitConfirmModal}
        {purchaseModal}
      </SafeAreaView>
    );
  }

  const showTimer = step === 'warmup_timer' || step === 'cooldown_timer';
  const warmupOrdinalTitle = `Warmup ${Math.min(warmupNames.length, warmupIndex + 1)}`;
  const cooldownOrdinalTitle = `Cooldown ${Math.min(cooldownNames.length, cooldownIndex + 1)}`;
  const topExerciseOrdinalTitle = step === 'warmup_timer' ? warmupOrdinalTitle : step === 'cooldown_timer' ? cooldownOrdinalTitle : '';

  const cooldownStretchMessage = 'Take a moment to stretch and cool down.';

  const activeGuideSource =
    step === 'warmup_timer'
      ? getWarmupGuideSource(activeExerciseName)
      : step === 'cooldown_timer'
        ? getCooldownGuideSource(activeExerciseName)
        : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {trainingGuidePreloadLayer}
      {!hideSessionNav ? (
        <View style={styles.floatingControlsRow}>
          {previousButton}
          {skipButton}
        </View>
      ) : null}
      {sessionNav}

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
          <Text style={styles.exerciseOrdinalTitle}>{topExerciseOrdinalTitle}</Text>
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
      {previousConfirmModal}
      {quitConfirmModal}
      {purchaseModal}
    </SafeAreaView>
  );
}

const IS_ANDROID_CAT = Platform.OS === 'android';
const CAT_TOP_LEFT_OFFSET = IS_ANDROID_CAT ? 10 : 4;
const CAT_TRAINING_GUIDE_ELEVATION = IS_ANDROID_CAT ? { elevation: 50 as const } : {};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  // Top-center pose guide for known punching modules.
  trainingPoseGuideWrap: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    zIndex: 50,
    ...CAT_TRAINING_GUIDE_ELEVATION,
    alignItems: 'center',
  },
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
  topLeftOverlay: {
    position: 'absolute',
    top: CAT_TOP_LEFT_OFFSET,
    left: 16,
    zIndex: 35,
  },
  /** Top-left anchor for SessionNavMenu (hamburger + slide panel). */
  sessionNavPosition: {
    position: 'absolute',
    top: CAT_TOP_LEFT_OFFSET,
    left: 16,
    zIndex: 35,
  },
  activeBody: { flex: 1, paddingHorizontal: 20, paddingTop: 26 },
  exerciseOrdinalTitle: {
    color: '#07bbc0',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 34,
    marginBottom: 2,
  },
  exerciseTitleLarge: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 0,
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
  introductionVideoWrap: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#041527',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#0a3645',
  },
  introductionVideo: {
    width: '100%',
    height: 220,
    backgroundColor: '#000',
  },
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
  modalDisabled: { opacity: 0.5 },
  purchaseBalanceText: { color: '#FFFFFF', fontSize: 13, marginTop: 4, marginBottom: 8, textAlign: 'center' },
  paywallCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#011f36',
    borderWidth: 1.5,
    borderColor: '#07bbc0',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: '#07bbc0',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  paywallEyebrow: { color: '#6b8693', fontSize: 11, letterSpacing: 1.5, fontWeight: '800', marginBottom: 8 },
  paywallTitle: { color: '#07bbc0', fontSize: 28, fontWeight: '900', marginBottom: 8, letterSpacing: 0.2 },
  paywallSub: { color: '#d7e3e8', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  paywallPriceBox: {
    backgroundColor: 'rgba(4, 21, 39, 0.75)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#062731',
    padding: 12,
    marginBottom: 16,
  },
  paywallPriceLabel: { color: '#6b8693', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  paywallCreditsValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  paywallPrimaryButton: {
    width: '100%',
    backgroundColor: '#07bbc0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  paywallPrimaryButtonText: { color: '#041527', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 },
  paywallSecondaryButton: {
    width: '100%',
    backgroundColor: '#041527',
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  paywallSecondaryButtonText: { color: '#07bbc0', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
  paywallClose: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, marginTop: 2 },
  paywallCloseText: { color: '#6b8693', fontSize: 13, fontWeight: '700' },
});


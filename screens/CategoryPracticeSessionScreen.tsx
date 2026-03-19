import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
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

type SessionStep =
  | 'warmup_ready_go'
  | 'warmup_timer'
  | 'training_pose_loading'
  | 'training_pose'
  | 'training_complete'
  | 'cooldown_ready_go'
  | 'cooldown_timer'
  | 'session_done';

type CountdownText = '3' | '2' | '1' | 'ARE YOU READY?' | 'GO!!';

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

  // Priority order (mirrors ViewModuleScreen):
  // 1) referencePoseData/{moduleId} (when module.hasReferencePose)
  // 2) module inline referencePoseSequences/referencePoseSequence
  // 3) referencePoseSequenceUrl fetch
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

export default function CategoryPracticeSessionScreen({
  category,
  warmups,
  cooldowns,
  trainingModules,
  mannequinGifUri,
  onExit,
}: CategoryPracticeSessionScreenProps) {
  const [step, setStep] = useState<SessionStep>('warmup_ready_go');

  const warmupNames = useMemo(() => warmups.filter((w) => !!w && w !== '—'), [warmups]);
  const cooldownNames = useMemo(() => cooldowns.filter((c) => !!c && c !== '—'), [cooldowns]);

  const [warmupIndex, setWarmupIndex] = useState(0);
  const [cooldownIndex, setCooldownIndex] = useState(0);
  const [trainingIndex, setTrainingIndex] = useState(0);

  const [activeExerciseName, setActiveExerciseName] = useState<string>('');

  const [countdownText, setCountdownText] = useState<CountdownText>('3');
  const countdownTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(30);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentTrainingItem = trainingModules[trainingIndex] ?? null;
  const [module, setModule] = useState<Module | null>(null);

  const [poseCorrectReps, setPoseCorrectReps] = useState(0);
  const [poseCurrentRepCorrect, setPoseCurrentRepCorrect] = useState<boolean | null>(null);
  const [referencePoseSequence, setReferencePoseSequence] = useState<PoseSequence | PoseSequence[] | null>(null);
  const [referencePoseFocus, setReferencePoseFocus] = useState<PoseFocus>(DEFAULT_POSE_FOCUS);
  const [poseLoadingError, setPoseLoadingError] = useState<string | null>(null);
  const [poseSessionKey, setPoseSessionKey] = useState(0);

  const requiredReps = module ? getRequiredReps(module.repRange) : 0;
  const matchThreshold = referencePoseFocus === 'punching' ? PUNCHING_MATCH_THRESHOLD : DEFAULT_MATCH_THRESHOLD;

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

  const runReadyGoCountdown = (onDone: () => void) => {
    clearCountdown();
    const schedule = (text: CountdownText, delayMs: number) => {
      const tid = setTimeout(() => setCountdownText(text), delayMs);
      countdownTimeoutsRef.current.push(tid);
    };
    // Display: 3 -> 2 -> 1 -> ARE YOU READY? -> GO!
    setCountdownText('3');
    schedule('3', 0);
    schedule('2', 650);
    schedule('1', 1300);
    schedule('ARE YOU READY?', 1950);
    schedule('GO!!', 2750);
    const finalTid = setTimeout(() => onDone(), 3250);
    countdownTimeoutsRef.current.push(finalTid);
  };

  const exitTrainingToCooldownOrDone = () => {
    if (cooldownNames.length > 0) {
      setCooldownIndex(0);
      setActiveExerciseName(cooldownNames[0] ?? '');
      setStep('cooldown_ready_go');
    } else {
      setStep('session_done');
    }
  };

  // Initialize: warmups (or jump straight to training).
  useEffect(() => {
    if (warmupNames.length > 0) {
      setActiveExerciseName(warmupNames[0] ?? '');
      setWarmupIndex(0);
      setStep('warmup_ready_go');
      return;
    }

    if (trainingModules.length > 0) {
      setStep('training_pose_loading');
      return;
    }

    if (cooldownNames.length > 0) {
      setCooldownIndex(0);
      setActiveExerciseName(cooldownNames[0] ?? '');
      setStep('cooldown_ready_go');
      return;
    }

    setStep('session_done');
  }, [cooldownNames.length, trainingModules.length, warmupNames.length]);

  // Warmup sequence
  useEffect(() => {
    if (step === 'warmup_ready_go') {
      runReadyGoCountdown(() => {
        setStep('warmup_timer');
        startTimer(30, () => {
          const next = warmupIndex + 1;
          if (next < warmupNames.length) {
            setWarmupIndex(next);
            setActiveExerciseName(warmupNames[next] ?? '');
            setStep('warmup_ready_go');
          } else {
            // Warmups done -> training
            if (trainingModules.length > 0) {
              setTrainingIndex(0);
              setStep('training_pose_loading');
            } else {
              exitTrainingToCooldownOrDone();
            }
          }
        });
      });
    }

    return () => {
      clearCountdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, warmupIndex, warmupNames.length, trainingModules.length]);

  // Cooldown sequence
  useEffect(() => {
    if (step === 'cooldown_ready_go') {
      runReadyGoCountdown(() => {
        setStep('cooldown_timer');
        startTimer(30, () => {
          const next = cooldownIndex + 1;
          if (next < cooldownNames.length) {
            setCooldownIndex(next);
            setActiveExerciseName(cooldownNames[next] ?? '');
            setStep('cooldown_ready_go');
          } else {
            setStep('session_done');
          }
        });
      });
    }

    return () => {
      clearCountdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cooldownIndex, cooldownNames.length]);

  // Stop timer when leaving timer steps.
  useEffect(() => {
    if (step !== 'warmup_timer' && step !== 'cooldown_timer') clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Training: load module and reference.
  useEffect(() => {
    if (step !== 'training_pose_loading') return;
    if (!currentTrainingItem) {
      exitTrainingToCooldownOrDone();
      return;
    }

    let cancelled = false;
    const modId = currentTrainingItem.moduleId;
    const go = async () => {
      setPoseLoadingError(null);
      setPoseSessionKey((k) => k + 1);
      setPoseCorrectReps(0);
      setPoseCurrentRepCorrect(null);
      setReferencePoseSequence(null);
      setReferencePoseFocus(DEFAULT_POSE_FOCUS);
      setModule(null);

      try {
        const full = await AuthController.getModuleByIdForUser(modId);
        if (cancelled) return;
        if (!full) throw new Error('Module not found');
        setModule(full);
        const refLoaded = await loadReferenceSequence(full);
        if (cancelled) return;
        setReferencePoseSequence(refLoaded.referencePoseSequence);
        setReferencePoseFocus(refLoaded.referencePoseFocus);
        setStep('training_pose');
      } catch (e) {
        if (cancelled) return;
        setPoseLoadingError(e instanceof Error ? e.message : 'Pose loading failed');
        // Still allow practice mode without reference (PoseCameraView can run without reference).
        setReferencePoseSequence(null);
        setReferencePoseFocus(
          currentTrainingItem.category === 'Punching' ? 'punching' : currentTrainingItem.category === 'Kicking' ? 'kicking' : 'full'
        );
        setModule(
          (prev) =>
            prev ??
            ({
              moduleId: modId,
              trainerId: '',
              moduleTitle: currentTrainingItem.moduleTitle ?? 'Training module',
              description: '',
              category,
              status: 'approved',
              createdAt: new Date(),
              updatedAt: new Date(),
              repRange: 'default',
            } as unknown as Module)
        );
        setStep('training_pose');
      }
    };
    go();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, trainingIndex]);

  // Auto-complete when reps met.
  const [hasRecordedCompletion, setHasRecordedCompletion] = useState(false);
  useEffect(() => {
    if (step !== 'training_pose') return;
    if (!module) return;
    if (hasRecordedCompletion) return;
    if (poseCorrectReps >= requiredReps && requiredReps > 0) {
      setHasRecordedCompletion(true);
      // Record completion immediately, then show module complete UI.
      AuthController.recordModuleCompletion(module.moduleId)
        .catch(() => {})
        .finally(() => {
          setStep('training_complete');
        });
    }
  }, [hasRecordedCompletion, module, poseCorrectReps, requiredReps, step]);

  const handlePracticeAgain = () => {
    setHasRecordedCompletion(false);
    setPoseCorrectReps(0);
    setPoseCurrentRepCorrect(null);
    setPoseSessionKey((k) => k + 1);
    setStep('training_pose');
  };

  const handleProceedNextTraining = () => {
    setHasRecordedCompletion(false);
    clearTimer();
    const next = trainingIndex + 1;
    if (next < trainingModules.length) {
      setTrainingIndex(next);
      setStep('training_pose_loading');
    } else {
      exitTrainingToCooldownOrDone();
    }
  };

  const backButton = (
    <TouchableOpacity style={styles.backButton} onPress={onExit} activeOpacity={0.85}>
      <Text style={styles.backButtonText}>Back</Text>
    </TouchableOpacity>
  );

  if (step === 'session_done') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.sessionTitle}>Session Complete</Text>
          <Text style={styles.sessionSubtitle}>Nice work. You finished Warmup → Training → Cooldown.</Text>
          {backButton}
        </View>
      </SafeAreaView>
    );
  }

  // Pose camera is full-screen inside PoseCameraView (it also draws its own back button).
  // Render it standalone to avoid duplicate headers/back UI.
  if (step === 'training_pose' && module) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <PoseCameraView
          key={poseSessionKey}
          requiredReps={requiredReps}
          correctReps={poseCorrectReps}
          isCurrentRepCorrect={poseCurrentRepCorrect}
          onBack={onExit}
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
        />
      </SafeAreaView>
    );
  }

  const showCountdownOverlay = step === 'warmup_ready_go' || step === 'cooldown_ready_go';
  const showTimer = step === 'warmup_timer' || step === 'cooldown_timer';

  const topSectionTitle =
    step === 'warmup_ready_go' || step === 'warmup_timer'
      ? `Warmup`
      : step === 'cooldown_ready_go' || step === 'cooldown_timer'
        ? `Cool Down`
        : 'Training';

  const cooldownStretchMessage = 'Take a moment to stretch and cool down.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={step !== 'training_pose' && step !== 'training_pose_loading'}
      >
        <View style={styles.header}>
          {backButton}
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{topSectionTitle}</Text>
            <Text style={styles.headerSub}>{category}</Text>
          </View>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.gifWrap}>
          {mannequinGifUri ? (
            <Image source={{ uri: mannequinGifUri }} style={styles.gifImage} resizeMode="contain" />
          ) : (
            <View style={styles.gifPlaceholder}>
              <Text style={styles.gifPlaceholderText}>Mannequin guide (GIF)</Text>
            </View>
          )}
        </View>

        {(step === 'warmup_ready_go' ||
          step === 'warmup_timer' ||
          step === 'cooldown_ready_go' ||
          step === 'cooldown_timer') && (
          <View style={styles.card}>
            <Text style={styles.exerciseTitle}>{activeExerciseName}</Text>
            {(step === 'cooldown_ready_go' || step === 'cooldown_timer') && (
              <Text style={styles.cooldownStretchText}>{cooldownStretchMessage}</Text>
            )}
            {showCountdownOverlay ? (
              <View style={styles.countdownOverlayCard}>
                <Text style={styles.countdownText}>{countdownText}</Text>
              </View>
            ) : showTimer ? (
              <View style={styles.timerBox}>
                <Text style={styles.timerText}>{formatTime(timerRemainingSeconds)}</Text>
                <Text style={styles.timerLabel}>time left</Text>
              </View>
            ) : (
              <ActivityIndicator size="large" color="#07bbc0" />
            )}
          </View>
        )}

        {step === 'training_pose_loading' && (
          <View style={styles.card}>
            <Text style={styles.exerciseTitle}>{currentTrainingItem?.moduleTitle ?? 'Training module'}</Text>
            <Text style={styles.trainingHint}>Preparing pose reference and starting camera…</Text>
            <ActivityIndicator size="large" color="#07bbc0" />
            {poseLoadingError ? <Text style={styles.errorText}>{poseLoadingError}</Text> : null}
          </View>
        )}

        {step === 'training_pose' && module && (
          <View style={styles.trainingPoseWrap}>
            <PoseCameraView
              key={poseSessionKey}
              requiredReps={requiredReps}
              correctReps={poseCorrectReps}
              isCurrentRepCorrect={poseCurrentRepCorrect}
              onBack={onExit}
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
              showArmState={false}
              showOverlayHint={false}
            />
          </View>
        )}

        {step === 'training_complete' && module && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Module Complete!</Text>
            <Text style={styles.exerciseTitle}>{module.moduleTitle}</Text>
            <Text style={styles.completeMessage}>You successfully completed the required reps.</Text>

            <View style={styles.completeActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handlePracticeAgain} activeOpacity={0.9}>
                <Text style={styles.secondaryButtonText}>Practice Again</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryButton} onPress={handleProceedNextTraining} activeOpacity={0.9}>
                <Text style={styles.primaryButtonText}>Proceed</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#062731' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#07bbc0', fontSize: 16, fontWeight: '800' },
  headerSub: { color: '#6b8693', fontSize: 12, marginTop: 2 },
  backButton: { width: 60, paddingVertical: 8 },
  backButtonText: { color: '#FFF', fontWeight: '600' },
  gifWrap: { paddingHorizontal: 16, paddingTop: 12 },
  gifImage: { width: '100%', height: 140, borderRadius: 16, backgroundColor: '#011f36' },
  gifPlaceholder: { width: '100%', height: 140, borderRadius: 16, backgroundColor: '#011f36', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#062731' },
  gifPlaceholderText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 12 },
  card: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#011f36', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#0a3645' },
  exerciseTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  cooldownStretchText: { color: '#6b8693', fontSize: 14, marginBottom: 12, textAlign: 'center', lineHeight: 20 },
  trainingHint: { color: '#6b8693', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  errorText: { color: '#ff6b6b', fontSize: 12, marginTop: 10, textAlign: 'center' },
  timerBox: { alignItems: 'center', marginVertical: 24, paddingVertical: 24, backgroundColor: '#062731', borderRadius: 16 },
  timerText: { color: '#07bbc0', fontSize: 48, fontWeight: '700' },
  timerLabel: { color: '#6b8693', fontSize: 14, marginTop: 4 },
  countdownOverlayCard: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    marginTop: 18,
  },
  countdownText: { color: '#FFF', fontSize: 56, fontWeight: '900', letterSpacing: 0.6, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  trainingPoseWrap: { height: '100%' },
  sectionLabel: { color: '#07bbc0', fontSize: 16, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  completeMessage: { color: '#6b8693', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  completeActions: { gap: 12 },
  primaryButton: { backgroundColor: '#07bbc0', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#041527', fontSize: 16, fontWeight: '800' },
  secondaryButton: { borderWidth: 2, borderColor: '#07bbc0', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#07bbc0', fontSize: 16, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 10 },
  sessionTitle: { color: '#07bbc0', fontSize: 22, fontWeight: '900' },
  sessionSubtitle: { color: '#6b8693', fontSize: 14, textAlign: 'center' },
});


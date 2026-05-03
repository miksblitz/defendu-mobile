/**
 * ViewModuleScreen
 * Displays a single training module: intro → safety protocol → introduction (video/text) → try it / pose → complete.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Image,
  Linking,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { AuthController, type ModuleItem } from '../lib/controllers/AuthController';
import type { Module } from '../lib/models/Module';
import type { ModuleReview } from '../lib/models/ModuleReview';
import { getRequiredReps } from '../utils/repRange';
import PoseCameraView from '../components/PoseCameraView';
import SessionNavMenu from '../components/SessionNavMenu';
import type { PoseSequence, PoseFocus, PoseFrame } from '../lib/pose/types';
import { DEFAULT_POSE_FOCUS } from '../lib/pose/types';
import { DEFAULT_MATCH_THRESHOLD, PUNCHING_MATCH_THRESHOLD } from '../lib/pose/comparator';
import { TrainingPoseGuideOverlay } from '../lib/trainingGuideMedia';

// --- Types & props ---
type Step = 'intro' | 'safety' | 'video' | 'tryIt' | 'tryItPoseLoading' | 'tryItPose' | 'complete';

interface ViewModuleScreenProps {
  moduleId: string;
  onBack: () => void;
  /** Optional slim module from dashboard: show intro immediately and load full module in background. */
  initialModule?: ModuleItem | null;
}

// --- Helpers ---
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Turn Firebase array-like (object with numeric keys) or nested frames into a real PoseSequence. */
function frameToArray(frame: unknown): PoseFrame | null {
  if (Array.isArray(frame) && frame.length > 0) return frame as PoseFrame;
  if (frame && typeof frame === 'object') {
    const keys = Object.keys(frame).filter((k) => /^\d+$/.test(k)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
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
    const keys = Object.keys(val).filter((k) => /^\d+$/.test(k)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    if (keys.length > 0) arr = keys.map((k) => (val as Record<string, unknown>)[k]);
  }
  if (arr.length === 0) return null;
  const frames = arr.map(frameToArray).filter((f): f is PoseFrame => f != null);
  return frames.length > 0 ? frames : null;
}

function toPoseSequenceArray(val: unknown): PoseSequence[] | null {
  let arr: unknown[] = [];
  if (Array.isArray(val) && val.length > 0) arr = val;
  else if (val && typeof val === 'object' && !Array.isArray(val)) {
    const keys = Object.keys(val).filter((k) => /^\d+$/.test(k)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    if (keys.length > 0) arr = keys.map((k) => (val as Record<string, unknown>)[k]);
  }
  if (arr.length === 0) return null;
  const seqs = arr.map((s) => toPoseSequence(s)).filter((s): s is PoseSequence => s != null);
  return seqs.length > 0 ? seqs : null;
}

function openVideoInBrowser(url: string | undefined) {
  if (!url?.trim()) return;
  Linking.openURL(url.trim()).catch(() => {});
}

// --- Component ---
export default function ViewModuleScreen({ moduleId, onBack, initialModule }: ViewModuleScreenProps) {
  // State: if we have initialModule (slim from dashboard), show intro immediately; full module loads in background.
  const [module, setModule] = useState<Module | null>(() =>
    initialModule ? ({ ...initialModule, createdAt: initialModule.createdAt ?? new Date(), updatedAt: initialModule.updatedAt ?? new Date() } as Module) : null
  );
  const [loading, setLoading] = useState(!initialModule);
  const [step, setStep] = useState<Step>('intro');
  const [tryItRemainingSeconds, setTryItRemainingSeconds] = useState(0);
  const [tryItTotalSeconds, setTryItTotalSeconds] = useState(60);
  const [tryItPaused, setTryItPaused] = useState(false);
  const [reviews, setReviews] = useState<ModuleReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [userComment, setUserComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false);
  const [poseCorrectReps, setPoseCorrectReps] = useState(0);
  const [poseCurrentRepCorrect, setPoseCurrentRepCorrect] = useState<boolean | null>(null);
  const [tryItPoseSessionKey, setTryItPoseSessionKey] = useState(0);
  const [tryItPosePaused, setTryItPosePaused] = useState(false);
  const [referencePoseSequence, setReferencePoseSequence] = useState<PoseSequence | PoseSequence[] | null>(null);
  const [referencePoseFocus, setReferencePoseFocus] = useState<PoseFocus>(DEFAULT_POSE_FOCUS);
  const [referencePoseLoading, setReferencePoseLoading] = useState(false);
  const [poseLoadingProgress, setPoseLoadingProgress] = useState(0);
  const tryItTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const poseRampRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Sync refs for silent training-failure analytics (recommendations); no UI. */
  const stepRef = useRef<Step>(step);
  const poseCorrectRepsRef = useRef(poseCorrectReps);
  const moduleRefForFailure = useRef<Module | null>(null);
  const moduleIdRef = useRef(moduleId);
  const poseFailureLoggedRef = useRef(false);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    poseCorrectRepsRef.current = poseCorrectReps;
  }, [poseCorrectReps]);
  useEffect(() => {
    moduleRefForFailure.current = module;
  }, [module]);
  useEffect(() => {
    moduleIdRef.current = moduleId;
  }, [moduleId]);
  useEffect(() => {
    if (step === 'tryItPose') {
      poseFailureLoggedRef.current = false;
    }
  }, [step]);

  useEffect(() => {
    return () => {
      if (stepRef.current !== 'tryItPose') return;
      if (poseFailureLoggedRef.current) return;
      const mod = moduleRefForFailure.current;
      const mid = moduleIdRef.current;
      if (!mod || !mid) return;
      const req = getRequiredReps(mod.repRange);
      if (req > 0 && poseCorrectRepsRef.current < req) {
        AuthController.recordModuleTrainingFailure(mid).catch(() => {});
      }
    };
  }, []);

  // Load full module from Firebase.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!moduleId) {
        onBack();
        return;
      }
      try {
        const data = await AuthController.getModuleByIdForUser(moduleId);
        if (cancelled) return;
        if (!data) {
          if (!initialModule) onBack();
          return;
        }
        setModule(data);
        if (!initialModule) setStep('intro');
      } catch (e) {
        console.error('ViewModule load:', e);
        if (!initialModule && !cancelled) onBack();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [moduleId, onBack, initialModule]);

  // Handlers
  const loadReviews = async () => {
    if (!moduleId) return;
    try {
      setReviewsLoading(true);
      const list = await AuthController.getModuleReviews(moduleId);
      setReviews(list);
      const user = await AuthController.getCurrentUser();
      if (user) {
        const myReview = list.find((r) => r.userId === user.uid);
        if (myReview) {
          setReviewSubmitted(true);
          setUserRating(myReview.rating);
          setUserComment(myReview.comment || '');
        }
      }
    } catch (e) {
      console.error('loadReviews:', e);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    if (module?.moduleId) loadReviews();
  }, [module?.moduleId]);

  useEffect(() => {
    if (step !== 'tryIt' || tryItPaused) {
      if (tryItTickRef.current) {
        clearInterval(tryItTickRef.current);
        tryItTickRef.current = null;
      }
      return;
    }
    tryItTickRef.current = setInterval(() => {
      setTryItRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (tryItTickRef.current) {
            clearInterval(tryItTickRef.current);
            tryItTickRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (tryItTickRef.current) {
        clearInterval(tryItTickRef.current);
        tryItTickRef.current = null;
      }
    };
  }, [step, tryItPaused]);

  const handleStart = () => setStep('safety');

  const handleSafetyConfirm = () => {
    // Skip intro/video flow and go straight to pose practice.
    handleTryWithPose();
  };

  const handleIntroDone = () => setStep('complete'); // no completion sync — user skipped hands-on training

  const recordCompletionForModuleView = useCallback(() => {
    const mid = moduleId ?? module?.moduleId;
    if (!mid) return;
    AuthController.recordModuleCompletion(mid).catch(() => {});
  }, [module?.moduleId, moduleId]);

  const handleTryItYourself = () => {
    const total = module?.trainingDurationSeconds ?? 60;
    setTryItTotalSeconds(total);
    setTryItRemainingSeconds(total);
    setTryItPaused(false);
    setStep('tryIt');
  };

  const handleTryWithPose = () => {
    setPoseCorrectReps(0);
    setPoseCurrentRepCorrect(null);
    setReferencePoseSequence(null);
    setReferencePoseLoading(false);
    setPoseLoadingProgress(0);
    setStep('tryItPoseLoading');
  };

  const rampProgressThenOpen = useCallback(() => {
    if (poseRampRef.current) {
      clearInterval(poseRampRef.current);
      poseRampRef.current = null;
    }
    const RAMP_MS = 60;
    const RAMP_STEP = 2;
    poseRampRef.current = setInterval(() => {
      setPoseLoadingProgress((p) => {
        const next = Math.min(p + RAMP_STEP, 100);
        if (next >= 100) {
          if (poseRampRef.current) clearInterval(poseRampRef.current);
          poseRampRef.current = null;
          setTimeout(() => setStep('tryItPose'), 400);
        }
        return next;
      });
    }, RAMP_MS);
  }, []);

  // Load pose reference only when user has tapped "Try with pose" (tryItPoseLoading). Keeps module intro/video fast.
  useEffect(() => {
    if ((step !== 'tryItPoseLoading' && step !== 'tryItPose') || !module) {
      if (step !== 'tryItPose' && step !== 'tryItPoseLoading') {
        setReferencePoseSequence(null);
        setReferencePoseFocus(DEFAULT_POSE_FOCUS);
      }
      return;
    }
    if (step === 'tryItPose' && (referencePoseSequence !== null || referencePoseLoading)) return;
    if (step === 'tryItPoseLoading' && referencePoseLoading) return;

    const focusVal = (module.referencePoseFocus === 'punching' || module.referencePoseFocus === 'kicking' || module.referencePoseFocus === 'full')
      ? module.referencePoseFocus
      : DEFAULT_POSE_FOCUS;

    const goToPoseScreen = rampProgressThenOpen;

    // 1) Ref stored in referencePoseData/{moduleId} — only fetch when still on loading step (avoid re-fetch loop)
    if (module.hasReferencePose && moduleId && step === 'tryItPoseLoading') {
      setReferencePoseLoading(true);
      let cancelled = false;
      const REF_POSE_TIMEOUT_MS = 8000;
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        cancelled = true;
        setReferencePoseSequence(null);
        setReferencePoseLoading(false);
        goToPoseScreen();
      }, REF_POSE_TIMEOUT_MS);
      AuthController.getReferencePoseData(moduleId)
        .then((data) => {
          if (cancelled) return;
          if (data?.sequences?.length) {
            const seqs = toPoseSequenceArray(data.sequences);
            if (seqs?.length) {
              setReferencePoseFocus((data.focus === 'punching' || data.focus === 'kicking' || data.focus === 'full') ? data.focus : focusVal);
              setReferencePoseSequence(seqs);
            }
          }
          clearTimeout(timeoutId);
          setReferencePoseLoading(false);
          goToPoseScreen();
        })
        .catch(() => {
          if (!cancelled) setReferencePoseSequence(null);
          clearTimeout(timeoutId);
          setReferencePoseLoading(false);
          goToPoseScreen();
        });
      return () => { cancelled = true; clearTimeout(timeoutId); };
    }

    // 2) Inline on module (legacy) — only when still on loading step
    if (step === 'tryItPoseLoading') {
      try {
        const dbSequences = toPoseSequenceArray(module.referencePoseSequences);
        if (dbSequences && dbSequences.length > 0) {
          setReferencePoseFocus(focusVal);
          setReferencePoseSequence(dbSequences);
          goToPoseScreen();
          return;
        }
        const dbSequence = toPoseSequence(module.referencePoseSequence);
        if (dbSequence && dbSequence.length > 0) {
          setReferencePoseFocus(focusVal);
          setReferencePoseSequence(dbSequence);
          goToPoseScreen();
          return;
        }
      } catch (_) {
        // fall through
      }

      // 3) Fetch from URL
      if (!module.referencePoseSequenceUrl) {
        setReferencePoseSequence(null);
        setReferencePoseFocus(DEFAULT_POSE_FOCUS);
        goToPoseScreen();
        return;
      }
    }

    if (step === 'tryItPoseLoading' && module.referencePoseSequenceUrl) {
      let cancelled = false;
      setReferencePoseLoading(true);
      fetch(module.referencePoseSequenceUrl)
      .then((r) => r.json())
      .then((data: { sequence?: PoseSequence; sequences?: PoseSequence[]; focus?: PoseFocus } | PoseSequence) => {
        if (cancelled) return;
        const obj = data && typeof data === 'object' && !Array.isArray(data) ? data as { focus?: PoseFocus } : {};
        const focus = obj.focus === 'punching' || obj.focus === 'kicking' || obj.focus === 'full' ? obj.focus : DEFAULT_POSE_FOCUS;
        setReferencePoseFocus(focus);
        if (data && typeof data === 'object' && Array.isArray((data as { sequences?: PoseSequence[] }).sequences)) {
          const list = (data as { sequences: PoseSequence[] }).sequences;
          setReferencePoseSequence(list.length > 0 ? list : null);
          return;
        }
        const seq = Array.isArray(data) ? data : (data as { sequence?: PoseSequence })?.sequence ?? null;
        setReferencePoseSequence(Array.isArray(seq) && seq.length > 0 ? seq : null);
      })
      .catch(() => {
        if (!cancelled) setReferencePoseSequence(null);
        if (!cancelled) setReferencePoseFocus(DEFAULT_POSE_FOCUS);
      })
      .finally(() => {
        if (!cancelled) setReferencePoseLoading(false);
        if (!cancelled) goToPoseScreen();
      });
      return () => { cancelled = true; };
    }
  }, [step, moduleId, module?.referencePoseSequenceUrl, module?.referencePoseSequence, module?.referencePoseSequences, module?.referencePoseFocus, module?.hasReferencePose]);

  // Animate progress (0 → 85%) slowly while fetching/unpacking reference so user sees steady activity.
  useEffect(() => {
    if (step !== 'tryItPoseLoading') return;
    const PROGRESS_INTERVAL_MS = 140;
    const PROGRESS_STEP = 1;
    const PROGRESS_CAP = 85;
    const tid = setInterval(() => {
      setPoseLoadingProgress((p) => (p >= PROGRESS_CAP ? p : Math.min(p + PROGRESS_STEP, PROGRESS_CAP)));
    }, PROGRESS_INTERVAL_MS);
    return () => clearInterval(tid);
  }, [step]);

  // Clear ramp interval if user leaves loading step (e.g. taps Back).
  useEffect(() => {
    if (step !== 'tryItPoseLoading' && poseRampRef.current) {
      clearInterval(poseRampRef.current);
      poseRampRef.current = null;
    }
  }, [step]);

  const logPosePracticeBailOnce = useCallback(() => {
    const mid = moduleIdRef.current;
    const mod = moduleRefForFailure.current;
    if (!mid || !mod || poseFailureLoggedRef.current) return;
    const req = getRequiredReps(mod.repRange);
    if (req <= 0 || poseCorrectRepsRef.current >= req) return;
    poseFailureLoggedRef.current = true;
    AuthController.recordModuleTrainingFailure(mid).catch(() => {});
  }, []);

  const handleSaveProgress = () => {
    if (moduleId) {
      // Fire-and-forget so we don't block exiting the screen if the user is offline.
      // The completion is idempotent on the server, so a retry on next launch is safe.
      AuthController.recordModuleCompletion(moduleId)
        .then((newCount) => {
          if (newCount > 0 && newCount % 5 === 0) {
            Alert.alert('Recommendations updated!', 'Your recommended modules have been refreshed. Check your dashboard.', [{ text: 'OK' }]);
          }
        })
        .catch((e) => {
          console.error('recordModuleCompletion:', e);
        });
    }
    onBack();
  };

  const handleSubmitReview = async () => {
    if (!moduleId || userRating < 1) return;
    try {
      setReviewSubmitting(true);
      await AuthController.submitModuleReview(moduleId, userRating, userComment || undefined);
      setReviewSubmitted(true);
      setUserComment('');
      await loadReviews();
    } catch (e) {
      console.error('submitModuleReview:', e);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 'intro') onBack();
    else if (step === 'safety') setStep('intro');
    else if (step === 'video') setStep('safety');
    else if (step === 'tryIt' || step === 'tryItPose' || step === 'tryItPoseLoading') {
      if (step === 'tryItPose') logPosePracticeBailOnce();
      setStep('safety');
    } else if (step === 'complete') onBack();
  };

  const isPunching = module?.category === 'Punching';

  // Loading state
  if (loading || !module) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#07bbc0" />
          <Text style={styles.loadingText}>Loading module...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const averageRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const reviewCount = reviews.length;

  if (step === 'tryItPoseLoading') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#07bbc0" />
          <Text style={styles.loadingText}>Preparing pose reference...</Text>
          <Text style={styles.loadingSubtext}>Getting reference and setting up camera</Text>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${poseLoadingProgress}%` }]} />
          </View>
          <Text style={styles.progressPercent}>{poseLoadingProgress}%</Text>
        </View>
        <TouchableOpacity
          style={styles.loadingBackButton}
          onPress={() => setStep('safety')}
        >
          <Text style={styles.loadingBackButtonText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (step === 'tryItPose' && module) {
    const categoryKey = module.category && String(module.category).trim() ? module.category : 'Punching';
    const exitTryPoseToSafety = () => {
      logPosePracticeBailOnce();
      setTryItPosePaused(false);
      setStep('safety');
    };
    const restartTryPose = () => {
      setTryItPosePaused(false);
      setTryItPoseSessionKey((k) => k + 1);
      setPoseCorrectReps(0);
      setPoseCurrentRepCorrect(null);
    };
    const toggleTryPosePause = () => {
      setTryItPosePaused((p) => !p);
    };
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.poseFullScreen}>
          <PoseCameraView
            key={tryItPoseSessionKey}
            requiredReps={getRequiredReps(module.repRange)}
            correctReps={poseCorrectReps}
            isCurrentRepCorrect={poseCurrentRepCorrect}
            onBack={exitTryPoseToSafety}
            showBackButton={false}
            onCorrectRepsUpdate={(count, lastCorrect) => {
              setPoseCorrectReps(count);
              setPoseCurrentRepCorrect(lastCorrect);
            }}
            referenceSequence={referencePoseLoading ? null : referencePoseSequence}
            poseFocus={referencePoseFocus}
            matchThreshold={referencePoseFocus === 'punching' ? PUNCHING_MATCH_THRESHOLD : DEFAULT_MATCH_THRESHOLD}
            poseVariant="default"
            moduleId={moduleId ?? undefined}
            category={categoryKey}
            showArmState={false}
            suppressBottomPoseHint
            showOverlayHint={false}
            paused={tryItPosePaused}
          />
          <SessionNavMenu
            containerStyle={styles.poseSessionNavPosition}
            onQuit={exitTryPoseToSafety}
            restartVisible
            onRestart={restartTryPose}
            pauseVisible
            paused={tryItPosePaused}
            onTogglePause={toggleTryPosePause}
          />
          <TrainingPoseGuideOverlay
            module={{
              moduleId: moduleId ?? module.moduleId,
              moduleTitle: module.moduleTitle,
              category: categoryKey,
              difficultyLevel: module.difficultyLevel ?? null,
              referenceGuideUrl: module.referenceGuideUrl,
            }}
            wrapStyle={styles.poseGuideWrap}
          />
          {poseCorrectReps >= getRequiredReps(module.repRange) && (
            <TouchableOpacity
              style={styles.continueOverlayButton}
              onPress={() => {
                recordCompletionForModuleView();
                setStep('complete');
              }}
            >
              <Text style={styles.primaryButtonText}>Continue to Complete</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Main: intro | safety | video | tryIt | complete
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Image source={require('../assets/images/icon-back.png')} style={styles.backButtonIcon} resizeMode="contain" />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {step === 'intro' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{module.moduleTitle}</Text>
            {module.thumbnailUrl ? (
              <Image source={{ uri: module.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
            ) : (
              <View style={styles.thumbnailPlaceholder}><Text style={styles.thumbIcon}>🥋</Text></View>
            )}
            <View style={styles.ratingRow}>
              <Text style={styles.ratingText}>
                {reviewCount > 0 ? `${averageRating.toFixed(1)} ★ (${reviewCount} reviews)` : 'No reviews yet'}
              </Text>
              {reviewCount > 0 && (
                <TouchableOpacity onPress={() => setShowAllReviewsModal(true)}>
                  <Text style={styles.showReviewsLink}>Show all</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.cardDescription}>{module.description}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handleStart}>
              <Text style={styles.primaryButtonText}>Start</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'safety' && (
          <View style={styles.card}>
            <Text style={styles.safetyTitle}>Safety Protocol</Text>
            <Text style={styles.safetyIntro}>Please read and confirm the following before starting this module:</Text>
            <View style={styles.safetyList}>
              <Text style={styles.safetyItem}>• Ensure you have enough space to move safely with no obstacles.</Text>
              <Text style={styles.safetyItem}>• Warm up before practicing. Do not train if you feel unwell or injured.</Text>
              <Text style={styles.safetyItem}>• This content is for educational purposes. Train at your own risk and within your ability.</Text>
              <Text style={styles.safetyItem}>• If using camera-based features, make sure the area behind you is clear.</Text>
              <Text style={styles.safetyItem}>• Stand about 2–3 meters from your phone and keep your full body in frame so reps can be detected correctly.</Text>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={handleSafetyConfirm}>
              <Text style={styles.primaryButtonText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('intro')}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'video' && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{isPunching ? 'Warm up' : 'Module Introduction'}</Text>
            {module.introduction ? <Text style={styles.introText}>{module.introduction}</Text> : null}
            <TouchableOpacity style={styles.secondaryButton} onPress={handleTryItYourself}>
              <Text style={styles.secondaryButtonText}>Try it yourself</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleTryWithPose}>
              <Text style={styles.secondaryButtonText}>Try with pose</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleIntroDone}>
              <Text style={styles.primaryButtonText}>Continue to Complete</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'tryIt' && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{isPunching ? 'Training' : 'Try it yourself'}</Text>
            <Text style={styles.tryItSubtext}>Practice for {formatTime(tryItTotalSeconds)}. Timer counts down.</Text>
            <View style={styles.timerBox}>
              <Text style={styles.timerText}>{formatTime(tryItRemainingSeconds)}</Text>
              <Text style={styles.timerLabel}>time left</Text>
            </View>
            {tryItRemainingSeconds > 0 ? (
              <>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setTryItPaused(!tryItPaused)}>
                  <Text style={styles.secondaryButtonText}>{tryItPaused ? 'Resume' : 'Pause'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    recordCompletionForModuleView();
                    setStep('complete');
                  }}
                >
                  <Text style={styles.primaryButtonText}>Finish</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.timesUpText}>Time's up!</Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    recordCompletionForModuleView();
                    setStep('complete');
                  }}
                >
                  <Text style={styles.primaryButtonText}>Continue to Complete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {step === 'complete' && (
          <View style={styles.card}>
            {isPunching ? (
              <>
                <Text style={styles.sectionLabel}>Cool Down</Text>
                {module.cooldownExercises && module.cooldownExercises.length > 0 ? (
                  <View style={styles.bulletList}>
                    {module.cooldownExercises.map((c, i) => (
                      <Text key={i} style={styles.bulletItem}>• {c}</Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.introText}>Take a moment to stretch and cool down.</Text>
                )}
              </>
            ) : null}
            <Text style={styles.completeTitle}>Module Complete!</Text>
            <Text style={styles.completeMessage}>You've successfully finished "{module.moduleTitle}".</Text>

            <View style={styles.rateSection}>
              <Text style={styles.rateSectionTitle}>Rate this module</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => !reviewSubmitted && setUserRating(i)}
                    style={styles.starTouchable}
                    disabled={reviewSubmitted}
                  >
                    <Text style={styles.starIcon}>{userRating >= i ? '★' : '☆'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.rateHint}>{reviewSubmitted ? 'You have already reviewed.' : 'Tap 1–5 stars'}</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Comment (optional)"
                placeholderTextColor="#6b8693"
                value={userComment}
                onChangeText={setUserComment}
                multiline
                numberOfLines={2}
                editable={!reviewSubmitting && !reviewSubmitted}
              />
              <TouchableOpacity
                style={[styles.primaryButton, (userRating < 1 || reviewSubmitted) && styles.buttonDisabled]}
                onPress={reviewSubmitted ? undefined : handleSubmitReview}
                disabled={(userRating < 1 || reviewSubmitting) || reviewSubmitted}
              >
                <Text style={styles.primaryButtonText}>
                  {reviewSubmitted ? 'Already rated' : reviewSubmitting ? 'Submitting...' : 'Submit review'}
                </Text>
              </TouchableOpacity>
            </View>

            {reviews.length > 0 && (
              <Pressable
                style={({ pressed }) => [styles.showReviewsBtn, pressed && styles.buttonPressed]}
                onPress={() => setTimeout(() => setShowAllReviewsModal(true), 0)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.showReviewsBtnText}>Show all reviews ({reviewCount})</Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              onPress={() => setTimeout(() => setStep('intro'), 0)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.secondaryButtonText}>Review Module</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              onPress={() => setTimeout(() => setStep('video'), 0)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.secondaryButtonText}>Practice Again</Text>
            </Pressable>
            <TouchableOpacity style={styles.primaryButton} onPress={handleSaveProgress}>
              <Text style={styles.primaryButtonText}>Save Progress</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal visible={showAllReviewsModal} transparent animationType="fade" onRequestClose={() => setShowAllReviewsModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAllReviewsModal(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>All reviews</Text>
              <TouchableOpacity onPress={() => setShowAllReviewsModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {reviews.length === 0 ? (
                <Text style={styles.modalEmpty}>No reviews yet.</Text>
              ) : (
                reviews.map((r) => (
                  <View key={r.userId + r.createdAt.getTime()} style={styles.reviewItem}>
                    <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                    <Text style={styles.reviewAuthor}>{r.userName}</Text>
                    {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// --- Styles ---
const IS_ANDROID_VM = Platform.OS === 'android';
const VM_TOP_LEFT = IS_ANDROID_VM ? 10 : 4;
const VM_ELEV_60 = IS_ANDROID_VM ? { elevation: 60 as const } : {};
const VM_ELEV_50 = IS_ANDROID_VM ? { elevation: 50 as const } : {};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  poseFullScreen: { flex: 1 },
  // Top-center pose guide gif for known punching modules.
  poseSessionNavPosition: {
    position: 'absolute',
    top: VM_TOP_LEFT,
    left: 16,
    zIndex: 60,
    ...VM_ELEV_60,
  },
  poseGuideWrap: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    zIndex: 50,
    ...VM_ELEV_50,
    alignItems: 'center',
  },
  continueOverlayButton: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    zIndex: 60,
    ...VM_ELEV_60,
    backgroundColor: '#07bbc0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#062731' },
  backButton: { paddingVertical: 8, paddingRight: 16 },
  backButtonIcon: { width: 24, height: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  videoStepLoading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 24 },
  loadingText: { color: '#6b8693', fontSize: 14 },
  loadingSubtext: { color: '#6b8693', fontSize: 12, marginTop: 4 },
  progressBarTrack: { width: '80%', maxWidth: 280, height: 8, backgroundColor: '#062731', borderRadius: 4, marginTop: 20, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#07bbc0', borderRadius: 4 },
  progressPercent: { color: '#07bbc0', fontSize: 24, fontWeight: '700', marginTop: 8 },
  loadingBackButton: { position: 'absolute', top: 48, left: 16, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8 },
  skipRefButton: { top: 'auto', left: 20, right: 20, bottom: 32, alignItems: 'center', backgroundColor: 'rgba(7, 187, 192, 0.9)' },
  loadingBackButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  card: { backgroundColor: '#011f36', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#0a3645', marginBottom: 20 },
  cardTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  thumbnail: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: '#0a3645' },
  thumbnailPlaceholder: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: '#0a3645', justifyContent: 'center', alignItems: 'center' },
  thumbIcon: { fontSize: 48 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  ratingText: { color: '#6b8693', fontSize: 14 },
  showReviewsLink: { color: '#07bbc0', fontSize: 14, fontWeight: '600' },
  cardDescription: { color: '#6b8693', fontSize: 14, marginBottom: 20 },
  safetyTitle: { color: '#07bbc0', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  safetyIntro: { color: '#FFF', fontSize: 14, marginBottom: 16 },
  safetyList: { marginBottom: 24 },
  safetyItem: { color: '#6b8693', fontSize: 14, marginBottom: 10, lineHeight: 22 },
  sectionLabel: { color: '#07bbc0', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  introText: { color: '#FFF', fontSize: 14, marginBottom: 16 },
  bulletList: { marginBottom: 16 },
  bulletItem: { color: '#b0c4d0', fontSize: 14, marginBottom: 6, lineHeight: 20 },
  videoOpenButton: { backgroundColor: '#062731', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 16 },
  videoOpenButtonText: { color: '#07bbc0', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  primaryButton: { backgroundColor: '#07bbc0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryButtonText: { color: '#041527', fontSize: 16, fontWeight: '700' },
  secondaryButton: { borderWidth: 2, borderColor: '#07bbc0', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 12, minHeight: 48, justifyContent: 'center' },
  secondaryButtonText: { color: '#07bbc0', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { opacity: 0.8 },
  tryItSubtext: { color: '#6b8693', fontSize: 14, marginBottom: 16 },
  timerBox: { alignItems: 'center', marginVertical: 24, paddingVertical: 24, backgroundColor: '#062731', borderRadius: 16 },
  timerText: { color: '#07bbc0', fontSize: 48, fontWeight: '700' },
  timerLabel: { color: '#6b8693', fontSize: 14, marginTop: 4 },
  timesUpText: { color: '#07bbc0', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  completeTitle: { color: '#07bbc0', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  completeMessage: { color: '#6b8693', fontSize: 14, marginBottom: 20 },
  rateSection: { marginBottom: 20 },
  rateSectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  starsRow: { flexDirection: 'row', marginBottom: 8 },
  starTouchable: { padding: 4 },
  starIcon: { fontSize: 28, color: '#f0c14b' },
  rateHint: { color: '#6b8693', fontSize: 12, marginBottom: 12 },
  commentInput: { borderWidth: 1, borderColor: '#062731', borderRadius: 8, padding: 12, color: '#FFF', fontSize: 14, minHeight: 80, marginBottom: 12 },
  showReviewsBtn: { marginBottom: 16, paddingVertical: 8, minHeight: 44 },
  showReviewsBtnText: { color: '#07bbc0', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#011f36', borderRadius: 16, borderWidth: 1, borderColor: '#062731', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#062731' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  modalClose: { color: '#FFF', fontSize: 24 },
  modalScroll: { maxHeight: 400, padding: 16 },
  modalEmpty: { color: '#6b8693', textAlign: 'center' },
  reviewItem: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#062731' },
  reviewStars: { color: '#f0c14b', fontSize: 14, marginBottom: 4 },
  reviewAuthor: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  reviewComment: { color: '#6b8693', fontSize: 14 },
});


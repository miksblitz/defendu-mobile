import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Image,
  Linking,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { AuthController } from '../lib/controllers/AuthController';
import type { Module } from '../lib/models/Module';
import type { ModuleReview } from '../lib/models/ModuleReview';
import PoseCameraView from '../components/PoseCameraView';
import { getRequiredReps } from '../utils/repRange';
import type { PoseSequence } from '../lib/pose/types';

type Step = 'intro' | 'video' | 'tryIt' | 'tryItPose' | 'complete';

interface ViewModuleScreenProps {
  moduleId: string;
  onBack: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function openVideoInBrowser(url: string | undefined) {
  if (!url?.trim()) return;
  Linking.openURL(url.trim()).catch(() => {});
}

export default function ViewModuleScreen({ moduleId, onBack }: ViewModuleScreenProps) {
  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [referencePoseSequence, setReferencePoseSequence] = useState<PoseSequence | null>(null);
  const [referencePoseLoading, setReferencePoseLoading] = useState(false);
  const tryItTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          onBack();
          return;
        }
        setModule(data);
        setStep('intro');
      } catch (e) {
        console.error('ViewModule load:', e);
        if (!cancelled) onBack();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [moduleId, onBack]);

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

  const handleStart = () => {
    const hasVideo = module?.introductionType === 'video' && module?.introductionVideoUrl;
    const hasText = module?.introductionType === 'text' && module?.introduction?.trim();
    if (hasVideo || hasText) {
      setStep('video');
    } else {
      setStep('complete');
    }
  };

  const handleIntroDone = () => setStep('complete');

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
    setStep('tryItPose');
  };

  useEffect(() => {
    if (step !== 'tryItPose' || !module?.referencePoseSequenceUrl) {
      setReferencePoseSequence(null);
      return;
    }
    let cancelled = false;
    setReferencePoseLoading(true);
    fetch(module.referencePoseSequenceUrl)
      .then((r) => r.json())
      .then((data: { sequence?: PoseSequence } | PoseSequence) => {
        if (cancelled) return;
        const seq = Array.isArray(data) ? data : data?.sequence ?? null;
        setReferencePoseSequence(Array.isArray(seq) && seq.length > 0 ? seq : null);
      })
      .catch(() => {
        if (!cancelled) setReferencePoseSequence(null);
      })
      .finally(() => {
        if (!cancelled) setReferencePoseLoading(false);
      });
    return () => { cancelled = true; };
  }, [step, module?.referencePoseSequenceUrl]);

  const handleSaveProgress = async () => {
    if (moduleId) {
      try {
        const newCount = await AuthController.recordModuleCompletion(moduleId);
        if (newCount > 0 && newCount % 5 === 0) {
          Alert.alert('Recommendations updated!', 'Your recommended modules have been refreshed. Check your dashboard.', [{ text: 'OK' }]);
        }
      } catch (e) {
        console.error('recordModuleCompletion:', e);
      }
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
    else if (step === 'video') setStep('intro');
    else if (step === 'tryIt' || step === 'tryItPose') setStep('video');
    else if (step === 'complete') onBack();
  };

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

  if (step === 'tryItPose') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.poseFullScreen}>
          <PoseCameraView
            requiredReps={getRequiredReps(module.repRange)}
            correctReps={poseCorrectReps}
            isCurrentRepCorrect={poseCurrentRepCorrect}
            onBack={() => setStep('video')}
            onCorrectRepsUpdate={(count, lastCorrect) => {
              setPoseCorrectReps(count);
              setPoseCurrentRepCorrect(lastCorrect);
            }}
            referenceSequence={referencePoseLoading ? null : referencePoseSequence}
          />
          {poseCorrectReps >= getRequiredReps(module.repRange) && (
            <TouchableOpacity
              style={styles.continueOverlayButton}
              onPress={() => setStep('complete')}
            >
              <Text style={styles.primaryButtonText}>Continue to Complete</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Image source={require('../assets/images/icon-back.png')} style={styles.backButtonIcon} resizeMode="contain" />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator>
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

        {step === 'video' && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Module Introduction</Text>
            {module.introductionType === 'video' && module.introductionVideoUrl ? (
              <>
                <TouchableOpacity
                  style={styles.videoOpenButton}
                  onPress={() => openVideoInBrowser(module.introductionVideoUrl)}
                >
                  <Text style={styles.videoOpenButtonText}>Open video in browser</Text>
                </TouchableOpacity>
                {module.introduction ? <Text style={styles.introText}>{module.introduction}</Text> : null}
              </>
            ) : (
              module.introduction ? <Text style={styles.introText}>{module.introduction}</Text> : null
            )}
            <TouchableOpacity style={styles.secondaryButton} onPress={handleTryItYourself}>
              <Text style={styles.secondaryButtonText}>Try it yourself</Text>
            </TouchableOpacity>
            {(module.techniqueVideoUrl ?? module.techniqueVideoLink) ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={handleTryWithPose}>
                <Text style={styles.secondaryButtonText}>Try with pose</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.primaryButton} onPress={handleIntroDone}>
              <Text style={styles.primaryButtonText}>Continue to Complete</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'tryIt' && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Try it yourself</Text>
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
                <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('complete')}>
                  <Text style={styles.primaryButtonText}>Finish</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.timesUpText}>Time's up!</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('complete')}>
                  <Text style={styles.primaryButtonText}>Continue to Complete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {step === 'complete' && (
          <View style={styles.card}>
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
              <TouchableOpacity style={styles.showReviewsBtn} onPress={() => setShowAllReviewsModal(true)}>
                <Text style={styles.showReviewsBtnText}>Show all reviews ({reviewCount})</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('intro')}>
              <Text style={styles.secondaryButtonText}>Review Module</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('video')}>
              <Text style={styles.secondaryButtonText}>Practice Again</Text>
            </TouchableOpacity>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  poseFullScreen: { flex: 1 },
  continueOverlayButton: { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: '#07bbc0', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#062731' },
  backButton: { paddingVertical: 8, paddingRight: 16 },
  backButtonIcon: { width: 24, height: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#6b8693', fontSize: 14 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: '#011f36', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#0a3645', marginBottom: 20 },
  cardTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  thumbnail: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: '#0a3645' },
  thumbnailPlaceholder: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: '#0a3645', justifyContent: 'center', alignItems: 'center' },
  thumbIcon: { fontSize: 48 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  ratingText: { color: '#6b8693', fontSize: 14 },
  showReviewsLink: { color: '#07bbc0', fontSize: 14, fontWeight: '600' },
  cardDescription: { color: '#6b8693', fontSize: 14, marginBottom: 20 },
  sectionLabel: { color: '#07bbc0', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  introText: { color: '#FFF', fontSize: 14, marginBottom: 16 },
  videoOpenButton: { backgroundColor: '#062731', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 16 },
  videoOpenButtonText: { color: '#07bbc0', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  primaryButton: { backgroundColor: '#07bbc0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryButtonText: { color: '#041527', fontSize: 16, fontWeight: '700' },
  secondaryButton: { borderWidth: 2, borderColor: '#07bbc0', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  secondaryButtonText: { color: '#07bbc0', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
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
  showReviewsBtn: { marginBottom: 16 },
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

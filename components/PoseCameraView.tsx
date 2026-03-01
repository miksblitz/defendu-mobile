import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  Animated,
} from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import type { PoseFrame, PoseSequence, PoseFocus } from '../lib/pose/types';
import { thinksysLandmarksToFrame } from '../lib/pose/mediapipeLandmarks';
import { isRepMatch, isRepMatchAny, DEFAULT_MATCH_THRESHOLD } from '../lib/pose/comparator';
import { createRepDetector } from '../lib/pose/repDetector';

type SwitchCameraFn = (() => void) | null;

export interface PoseCameraViewProps {
  requiredReps: number;
  correctReps: number;
  isCurrentRepCorrect: boolean | null;
  onBack: () => void;
  onCorrectRepsUpdate: (count: number, lastRepCorrect: boolean | null) => void;
  /** Reference pose sequence(s): one rep or array of reps (dataset). If null, practice mode. */
  referenceSequence: PoseSequence | PoseSequence[] | null;
  /** Focus region: punching (upper body), kicking (legs), or full. Default full. */
  poseFocus?: PoseFocus;
  /** Optional: match threshold for comparison (default 0.20). */
  matchThreshold?: number;
}

const POSE_THROTTLE_MS = 100;
const MIN_FRAMES_FOR_REP = 5;
const MAX_BUFFER_FRAMES = 120;
const SUCCESS_OVERLAY_MS = 1800;
const WRONG_OVERLAY_MS = 800;

export default function PoseCameraView({
  requiredReps,
  correctReps,
  isCurrentRepCorrect,
  onBack,
  onCorrectRepsUpdate,
  referenceSequence,
  poseFocus = 'full',
  matchThreshold = DEFAULT_MATCH_THRESHOLD,
}: PoseCameraViewProps) {
  const [ready, setReady] = useState(false);
  const [MediaPipeView, setMediaPipeView] = useState<React.ComponentType<{ width: number; height: number; onLandmark: (data: unknown) => void; [key: string]: unknown }> | null>(null);
  const [switchCameraFn, setSwitchCameraFn] = useState<SwitchCameraFn>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const frameBufferRef = useRef<PoseFrame[]>([]);
  const lastPoseTimeRef = useRef<number>(0);
  const repDetectorRef = useRef(createRepDetector(poseFocus));
  useEffect(() => {
    repDetectorRef.current = createRepDetector(poseFocus);
  }, [poseFocus]);
  const onCorrectRepsUpdateRef = useRef(onCorrectRepsUpdate);
  const correctRepsRef = useRef(correctReps);
  const referenceSequenceRef = useRef(referenceSequence);
  const matchThresholdRef = useRef(matchThreshold);
  const poseFocusRef = useRef(poseFocus);
  poseFocusRef.current = poseFocus;
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [showWrongOverlay, setShowWrongOverlay] = useState(false);
  const successFadeAnim = useRef(new Animated.Value(0)).current;
  const wrongFadeAnim = useRef(new Animated.Value(0)).current;
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  onCorrectRepsUpdateRef.current = onCorrectRepsUpdate;
  correctRepsRef.current = correctReps;
  referenceSequenceRef.current = referenceSequence;
  matchThresholdRef.current = matchThreshold;

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

  const pushFrame = useCallback((frame: PoseFrame) => {
    if (frame.length === 0) return;
    const now = Date.now();
    if (now - lastPoseTimeRef.current < POSE_THROTTLE_MS) return;
    lastPoseTimeRef.current = now;
    const buf = frameBufferRef.current;
    buf.push(frame);
    while (buf.length > MAX_BUFFER_FRAMES) buf.shift();

    const result = repDetectorRef.current(frame, now);
    if (!result.done) return;
    const segment = result.segment;
    if (segment.length < MIN_FRAMES_FOR_REP) return;

    const ref = referenceSequenceRef.current;
    const threshold = matchThresholdRef.current;
    const currentCount = correctRepsRef.current;
    const isArray = Array.isArray(ref) && ref.length > 0 && Array.isArray(ref[0]);
    const hasReference = ref != null && (
      isArray
        ? (ref as PoseSequence[]).some((seq) => seq.length >= MIN_FRAMES_FOR_REP)
        : (ref as PoseSequence).length >= MIN_FRAMES_FOR_REP
    );
    const focus = poseFocusRef.current;
    const match = !hasReference
      || (isArray ? isRepMatchAny(segment, ref as PoseSequence[], threshold, focus) : isRepMatch(segment, ref as PoseSequence, threshold, focus));

    if (match) {
      onCorrectRepsUpdateRef.current(currentCount + 1, true);
      setSuccessCount(currentCount + 1);
      setShowSuccessOverlay(true);
      successFadeAnim.setValue(1);
      Animated.timing(successFadeAnim, {
        toValue: 0,
        duration: SUCCESS_OVERLAY_MS,
        useNativeDriver: true,
      }).start(() => setShowSuccessOverlay(false));
    } else {
      onCorrectRepsUpdateRef.current(currentCount, false);
      setShowWrongOverlay(true);
      wrongFadeAnim.setValue(1);
      Animated.timing(wrongFadeAnim, {
        toValue: 0,
        duration: WRONG_OVERLAY_MS,
        useNativeDriver: true,
      }).start(() => setShowWrongOverlay(false));
    }
  }, [successFadeAnim, wrongFadeAnim]);

  const handleLandmark = useCallback(
    (data: unknown) => {
      const frame = thinksysLandmarksToFrame(data);
      if (frame.length > 0) pushFrame(frame);
    },
    [pushFrame]
  );

  const handleSwitchCamera = useCallback(() => {
    try {
      const fn = typeof switchCameraFn === 'function' ? switchCameraFn() : null;
      if (typeof fn === 'function') fn();
    } catch (_) {
      // ignore if native module not ready
    }
  }, [switchCameraFn]);

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
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
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
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
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
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
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
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MediaPipeView
        width={Math.round(screenWidth)}
        height={Math.round(screenHeight)}
        onLandmark={handleLandmark}
        face={true}
        leftArm={true}
        rightArm={true}
        leftWrist={true}
        rightWrist={true}
        torso={true}
        leftLeg={true}
        rightLeg={true}
        leftAnkle={true}
        rightAnkle={true}
      />
      {showSuccessOverlay && (
        <Animated.View
          style={[
            styles.successOverlay,
            { opacity: successFadeAnim },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.successNumber}>{successCount}</Text>
          <Text style={styles.successSubtext}>Correct rep!</Text>
        </Animated.View>
      )}
      {showWrongOverlay && (
        <Animated.View
          style={[styles.wrongOverlay, { opacity: wrongFadeAnim }]}
          pointerEvents="none"
        >
          <Text style={styles.wrongText}>Rep detected</Text>
          <Text style={styles.wrongSubtext}>No match — try again or get closer to reference</Text>
        </Animated.View>
      )}
      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>
          {poseFocus === 'punching' ? 'Upper body in frame — extend arm then retract' : poseFocus === 'kicking' ? 'Legs in frame — raise leg then lower' : 'Full body in frame — reps count automatically'}
        </Text>
        <Text style={styles.overlayHint}>
          {poseFocus === 'punching' ? 'Punch or strike: arm extends then returns' : poseFocus === 'kicking' ? 'Kick: leg up then back down' : 'Do a clear down–up movement (e.g. squat) so your hips go lower then back up'}
        </Text>
        {practiceMode && (
          <Text style={styles.practiceModeLabel}>Practice mode (no reference yet)</Text>
        )}
        {!practiceMode && referenceSequence && (
          <Text style={styles.referenceLoadedLabel}>
            Reference loaded ({poseFocus}) — {Array.isArray(referenceSequence) && Array.isArray(referenceSequence[0]) ? `${(referenceSequence as PoseSequence[]).length} examples` : '1 sequence'}
          </Text>
        )}
        <View style={styles.repBox}>
          <Text style={styles.repText}>
            {correctReps} / {requiredReps}
          </Text>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.switchCameraButton} onPress={handleSwitchCamera}>
            <Text style={styles.switchCameraButtonText}>Switch camera</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#041527' },
  placeholder: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#07bbc0', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  hint: { color: '#6b8693', fontSize: 14, marginBottom: 24, textAlign: 'center' },
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
  overlayTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 4 },
  overlayHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 8 },
  practiceModeLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 8 },
  referenceLoadedLabel: { color: 'rgba(34,197,94,0.95)', fontSize: 12, marginBottom: 4 },
  repBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  repText: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  switchCameraButton: {
    borderWidth: 2,
    borderColor: '#07bbc0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  switchCameraButtonText: { color: '#07bbc0', fontSize: 14, fontWeight: '600' },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 24 : 50,
    left: 16,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  backButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

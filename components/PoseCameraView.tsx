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
} from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import type { PoseFrame, PoseSequence } from '../lib/pose/types';
import { thinksysLandmarksToFrame } from '../lib/pose/mediapipeLandmarks';
import { isRepMatch, DEFAULT_MATCH_THRESHOLD } from '../lib/pose/comparator';

type SwitchCameraFn = (() => void) | null;

export interface PoseCameraViewProps {
  requiredReps: number;
  correctReps: number;
  isCurrentRepCorrect: boolean | null;
  onBack: () => void;
  onCorrectRepsUpdate: (count: number, lastRepCorrect: boolean | null) => void;
  /** Reference pose sequence (one rep). If null, practice mode: every rep counts. */
  referenceSequence: PoseSequence | null;
  /** Optional: match threshold for comparison (default 0.15). */
  matchThreshold?: number;
}

const POSE_THROTTLE_MS = 100;
const MIN_FRAMES_FOR_REP = 5;
const MAX_BUFFER_FRAMES = 120;

export default function PoseCameraView({
  requiredReps,
  correctReps,
  isCurrentRepCorrect,
  onBack,
  onCorrectRepsUpdate,
  referenceSequence,
  matchThreshold = DEFAULT_MATCH_THRESHOLD,
}: PoseCameraViewProps) {
  const [ready, setReady] = useState(false);
  const [MediaPipeView, setMediaPipeView] = useState<React.ComponentType<{ width: number; height: number; onLandmark: (data: unknown) => void; [key: string]: unknown }> | null>(null);
  const [switchCameraFn, setSwitchCameraFn] = useState<SwitchCameraFn>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const frameBufferRef = useRef<PoseFrame[]>([]);
  const lastPoseTimeRef = useRef<number>(0);
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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
  }, []);

  const handleRepPress = useCallback(() => {
    const buf = [...frameBufferRef.current];
    frameBufferRef.current = [];
    if (buf.length < MIN_FRAMES_FOR_REP) {
      onCorrectRepsUpdate(correctReps, false);
      return;
    }
    const hasReference = referenceSequence != null && referenceSequence.length >= MIN_FRAMES_FOR_REP;
    if (hasReference) {
      const match = isRepMatch(buf, referenceSequence, matchThreshold);
      if (match) {
        onCorrectRepsUpdate(correctReps + 1, true);
      } else {
        onCorrectRepsUpdate(correctReps, false);
      }
    } else {
      onCorrectRepsUpdate(correctReps + 1, true);
    }
  }, [correctReps, referenceSequence, matchThreshold, onCorrectRepsUpdate]);

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

  const practiceMode = referenceSequence == null || referenceSequence.length < MIN_FRAMES_FOR_REP;

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
      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>Full body in frame</Text>
        {practiceMode && (
          <Text style={styles.practiceModeLabel}>Practice mode (no reference yet)</Text>
        )}
        <View style={styles.repBox}>
          <Text style={styles.repText}>
            Correct reps: {correctReps} / {requiredReps}
          </Text>
          <View
            style={[
              styles.indicator,
              isCurrentRepCorrect === true && styles.indicatorGreen,
              isCurrentRepCorrect === false && styles.indicatorRed,
            ]}
          />
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.switchCameraButton} onPress={handleSwitchCamera}>
            <Text style={styles.switchCameraButtonText}>Switch camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.repButton} onPress={handleRepPress}>
            <Text style={styles.repButtonText}>Rep</Text>
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
  overlayTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 8 },
  practiceModeLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 8 },
  repBox: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  repText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  indicator: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.3)' },
  indicatorGreen: { backgroundColor: '#22c55e' },
  indicatorRed: { backgroundColor: '#ef4444' },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  switchCameraButton: {
    borderWidth: 2,
    borderColor: '#07bbc0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  switchCameraButtonText: { color: '#07bbc0', fontSize: 14, fontWeight: '600' },
  repButton: {
    backgroundColor: '#07bbc0',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  repButtonText: { color: '#041527', fontSize: 16, fontWeight: '700' },
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

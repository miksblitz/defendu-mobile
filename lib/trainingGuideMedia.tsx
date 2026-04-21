import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  Text,
  Pressable,
  Modal,
  Dimensions,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { getPunchingGuideSource } from './punchingGuideAssets';

export type TrainingGuideModuleFields = {
  moduleId: string;
  moduleTitle?: string | null;
  category?: string | null;
  /** basic | intermediate | advanced — shown above the module title */
  difficultyLevel?: 'basic' | 'intermediate' | 'advanced' | null;
  /** Pose reference guide media from Firebase only. */
  referenceGuideUrl?: string | null;
};

function pickRemoteGuideUri(m: TrainingGuideModuleFields): string | null {
  const candidates = [m.referenceGuideUrl];
  for (const c of candidates) {
    const u = typeof c === 'string' ? c.trim() : '';
    if (u && /^https?:\/\//i.test(u)) return u;
  }
  return null;
}

export function isProbablyStreamableVideoUri(uri: string): boolean {
  const path = uri.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v)$/i.test(path)) return true;
  if (path.includes('/video/upload')) return true;
  return false;
}

type RemoteGuideDesc =
  | { mode: 'bundled' }
  | { mode: 'none' }
  | { mode: 'image'; uri: string }
  | { mode: 'video'; uri: string };

export function getTrainingGuideRemoteDesc(module: TrainingGuideModuleFields): RemoteGuideDesc {
  const uri = pickRemoteGuideUri(module);
  if (uri) {
    if (isProbablyStreamableVideoUri(uri)) return { mode: 'video', uri };
    return { mode: 'image', uri };
  }
  const bundled = getPunchingGuideSource(module.moduleId, module.moduleTitle ?? undefined, module.category ?? undefined);
  if (bundled) return { mode: 'bundled' };
  return { mode: 'none' };
}

function difficultyLabel(level: TrainingGuideModuleFields['difficultyLevel']): string | null {
  if (level === 'basic') return 'Basic';
  if (level === 'intermediate') return 'Intermediate';
  if (level === 'advanced') return 'Advanced';
  return null;
}

/**
 * Warm remote guide media during safety / 3-2-1 / stance / loading so the training overlay appears immediately.
 */
export function TrainingGuidePreloader({
  module,
  active,
}: {
  module: TrainingGuideModuleFields | null;
  active: boolean;
}) {
  const desc = useMemo(() => {
    if (!module || !active) return { mode: 'none' as const };
    return getTrainingGuideRemoteDesc(module);
  }, [module, active]);

  useEffect(() => {
    if (!active || desc.mode !== 'image') return;
    Image.prefetch(desc.uri).catch(() => {});
  }, [active, desc]);

  if (!active || desc.mode !== 'video') return null;

  return (
    <View style={preloadStyles.host} pointerEvents="none" collapsable={false}>
      <Video
        key={desc.uri}
        source={{ uri: desc.uri }}
        style={preloadStyles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping
        isMuted
      />
    </View>
  );
}

const preloadStyles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0,
    overflow: 'hidden',
    left: 0,
    top: 0,
    zIndex: 0,
  },
  video: {
    width: 240,
    height: 120,
  },
});

function getGuideLayout() {
  const { width: winW, height: winH } = Dimensions.get('window');
  const baseW = Math.min(winW * 0.84, 380);
  const baseH = Math.min(Math.round(baseW * 0.56), 240);
  const expandedW = winW * 0.92;
  const expandedH = Math.min(winH * 0.68, Math.round(expandedW * 0.62));
  return { baseW, baseH, expandedW, expandedH };
}

/**
 * Top-center reference guide during pose training: difficulty + module title,
 * tappable GIF/video (tap for full-screen preview; tap anywhere to dismiss).
 */
export function TrainingPoseGuideOverlay({
  module,
  wrapStyle,
  mediaStyle: _legacyMediaStyle,
}: {
  module: TrainingGuideModuleFields;
  wrapStyle: ViewStyle;
  /** @deprecated sizes are computed from screen; kept for call-site compatibility */
  mediaStyle?: ImageStyle;
}) {
  void _legacyMediaStyle;
  const [expanded, setExpanded] = useState(false);
  const { baseW, baseH, expandedW, expandedH } = getGuideLayout();

  const bundled = getPunchingGuideSource(module.moduleId, module.moduleTitle ?? undefined, module.category ?? undefined);
  const uri = pickRemoteGuideUri(module);
  const tier = difficultyLabel(module.difficultyLevel ?? undefined);
  const title = typeof module.moduleTitle === 'string' ? module.moduleTitle.trim() : '';

  const renderMedia = (w: number, h: number) => {
    if (uri) {
      if (isProbablyStreamableVideoUri(uri)) {
        return (
          <Video
            source={{ uri }}
            style={{ width: w, height: h }}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
            isMuted
          />
        );
      }
      return <Image source={{ uri }} style={{ width: w, height: h }} resizeMode="contain" />;
    }
    if (bundled) {
      return <Image source={bundled} style={{ width: w, height: h }} resizeMode="contain" />;
    }
    return null;
  };

  const hasMedia = (uri != null && uri.length > 0) || bundled != null;

  return (
    <>
      <View style={[wrapStyle, guideStyles.wrap, { pointerEvents: 'box-none' }]}>
        {tier ? <Text style={guideStyles.tier}>{tier}</Text> : null}
        {title ? (
          <Text style={guideStyles.moduleTitle} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {hasMedia ? (
          <Pressable
            onPress={() => setExpanded(true)}
            style={({ pressed }) => [guideStyles.mediaTap, pressed && guideStyles.mediaTapPressed]}
            accessibilityRole="button"
            accessibilityLabel="Enlarge technique guide"
          >
            {renderMedia(baseW, baseH)}
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
        statusBarTranslucent
      >
        <Pressable style={guideStyles.modalBackdrop} onPress={() => setExpanded(false)} accessibilityLabel="Close guide">
          {hasMedia ? renderMedia(expandedW, expandedH) : null}
          <Text style={guideStyles.modalHint}>Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </>
  );
}

const guideStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  tier: {
    color: '#07bbc0',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 2,
  },
  moduleTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 8,
    lineHeight: 22,
  },
  /** Plain hit target around the guide — no border or caption. */
  mediaTap: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  mediaTapPressed: {
    opacity: 0.88,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
  },
  modalHint: {
    marginTop: 16,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '600',
  },
});

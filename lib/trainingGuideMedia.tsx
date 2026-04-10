import React, { useEffect, useMemo } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type ViewStyle } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { getPunchingGuideSource } from './punchingGuideAssets';

export type TrainingGuideModuleFields = {
  moduleId: string;
  moduleTitle?: string | null;
  category?: string | null;
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
  const bundled = getPunchingGuideSource(module.moduleId, module.moduleTitle ?? undefined, module.category ?? undefined);
  if (bundled) return { mode: 'bundled' };
  const uri = pickRemoteGuideUri(module);
  if (!uri) return { mode: 'none' };
  if (isProbablyStreamableVideoUri(uri)) return { mode: 'video', uri };
  return { mode: 'image', uri };
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

/**
 * Top-center reference guide during pose training: bundled punching GIFs first, then Firebase
 * reference guide URL only (`referenceGuideUrl`). GIF/PNG/JPG use Image; obvious video URLs use expo-av.
 */
export function TrainingPoseGuideOverlay({
  module,
  wrapStyle,
  mediaStyle,
}: {
  module: TrainingGuideModuleFields;
  wrapStyle: ViewStyle;
  mediaStyle: ImageStyle;
}) {
  const bundled = getPunchingGuideSource(module.moduleId, module.moduleTitle ?? undefined, module.category ?? undefined);
  if (bundled) {
    return (
      <View style={wrapStyle} pointerEvents="none">
        <Image source={bundled} style={mediaStyle} resizeMode="contain" />
      </View>
    );
  }

  const uri = pickRemoteGuideUri(module);
  if (!uri) return null;

  if (isProbablyStreamableVideoUri(uri)) {
    return (
      <View style={wrapStyle} pointerEvents="none">
        <Video
          source={{ uri }}
          style={mediaStyle}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isLooping
          isMuted
        />
      </View>
    );
  }

  return (
    <View style={wrapStyle} pointerEvents="none">
      <Image source={{ uri }} style={mediaStyle} resizeMode="contain" />
    </View>
  );
}


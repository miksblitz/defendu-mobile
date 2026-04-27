/**
 * DashboardScreen
 * Home: weekly goal, categories, recommended and category modules. Opens ViewModuleScreen.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  Animated,
  Platform,
  StatusBar,
  RefreshControl,
  Modal,
  Pressable,
  AppState,
  BackHandler,
  type ImageSourcePropType,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthController, type ModuleItem, type ModuleCategoryWithMeta } from '../lib/controllers/AuthController';
import type { Module } from '../lib/models/Module';
import type { SkillProfile } from '../lib/models/SkillProfile';
import type { ModuleTrainingStat, WeeklyReward } from '../lib/controllers/userProgress';
import {
  buildPersonalizedModuleRecommendations,
  PERFORMANCE_PHASE_COMPLETION_THRESHOLD,
} from '../lib/recommendations/trainingModuleRecommendations';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';
import { getCooldownGuideSource, getWarmupGuideSource } from '../lib/warmupGuideAssets';
import {
  getPurchasedModuleIds,
  getUserCreditsBalance,
  purchaseModulesWithCredits,
  type ModulePurchaseInvoice,
} from '../lib/controllers/modulePurchases';

// --- Constants ---
/** Training category hero images (assets/images/training/). */
const CATEGORY_IMAGES: Record<string, ReturnType<typeof require>> = {
  'Punching': require('../assets/images/training/punching.png'),
  'Kicking': require('../assets/images/training/kicking.png'),
  'Elbow Strikes': require('../assets/images/training/elbow-strikes.png'),
  'Knee Strikes': require('../assets/images/training/palm-strikes.png'),
  'Defensive Moves': require('../assets/images/training/defensive-moves.png'),
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SAFE_TOP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 48;
/** Hero overlay: smaller so modules get more space. */
const EXPANDED_HERO_HEIGHT = Math.min(SCREEN_HEIGHT * 0.28, 180);
const EXPANDED_HERO_MAX_WIDTH = SCREEN_WIDTH * 0.88;
const CARD_MARGIN = 12;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 2 - 24) / 2 - CARD_MARGIN / 2;
/** Fixed width for module cards in horizontal scroll (category overlay). */
const MODULE_ROW_CARD_WIDTH = Math.min(160, SCREEN_WIDTH * 0.42);
const MODULE_ROW_CARD_GAP = 12;

/** Horizontal category strip: card width so ~1.2 cards visible, with gap. */
const HORIZONTAL_CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.72, 280);
const HORIZONTAL_CARD_GAP = 16;
const HORIZONTAL_PADDING = 24;
const HORIZONTAL_SNAP_INTERVAL = HORIZONTAL_CARD_WIDTH + HORIZONTAL_CARD_GAP;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_MODULES_PER_DAY_GOAL = 5;
const DEFAULT_MODULES_PER_WEEK_GOAL = 35;
/** @deprecated Weekly progress now comes from completionTimestamps/dayProgress. Kept to avoid ReferenceError if cache references it. */
const progressValues = [0, 0, 0, 0, 0, 0, 0];

// --- Helpers ---
/** Start of current week (Monday 00:00) and end (Sunday 23:59:59.999) in local time. */
function getCurrentWeekRange(): { start: number; end: number } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

function getCurrentWeekStartMs(): number {
  return getCurrentWeekRange().start;
}

function getCurrentWeekKey(): string {
  const start = new Date(getCurrentWeekStartMs());
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

/** Day index 0=Mon .. 6=Sun from a timestamp. */
function getDayIndex(ts: number): number {
  const d = new Date(ts);
  return (d.getDay() + 6) % 7;
}

/** Completions per day (Mon=0 .. Sun=6) for the current week only. */
function getDayCountsThisWeek(completionTimestamps: Record<string, number>): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const { start, end } = getCurrentWeekRange();
  for (const ts of Object.values(completionTimestamps)) {
    if (ts >= start && ts <= end) counts[getDayIndex(ts)]++;
  }
  return counts;
}

/**
 * First-completion entries for one weekday (Mon=0 .. Sun=6) in the current local week; one row per module.
 * Same Monday 00:00 – Sunday 23:59:59 window as {@link getDayCountsThisWeek} / weekly goal; past weeks are excluded.
 */
function getCompletedModulesForWeekdayThisWeek(
  dayIndex: number,
  completionTimestamps: Record<string, number>
): { moduleId: string; completedAt: number }[] {
  const { start, end } = getCurrentWeekRange();
  const out: { moduleId: string; completedAt: number }[] = [];
  for (const [moduleId, ts] of Object.entries(completionTimestamps)) {
    if (ts >= start && ts <= end && getDayIndex(ts) === dayIndex) {
      out.push({ moduleId, completedAt: ts });
    }
  }
  out.sort((a, b) => b.completedAt - a.completedAt);
  return out;
}

function formatCompletionTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Calendar label for a weekday column in the current week (e.g. "Tue, Apr 8"). */
function getWeekdayColumnDateLabel(dayIndex: number): string {
  const start = getCurrentWeekStartMs();
  const d = new Date(start);
  d.setDate(d.getDate() + dayIndex);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** How often to check if the local calendar week rolled (Mon → new week), while the dashboard is mounted. */
const WEEK_BOUNDARY_POLL_MS = 30_000;

const DAY_DOUBLE_TAP_MS = 320;
const START_HERE_DOUBLE_TAP_MS = 350;

const MODULES_CACHE_KEY = 'dashboard_modules_cache';

function reviveCachedModules(raw: unknown): ModuleItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((item: Record<string, unknown>) => ({
    ...item,
    createdAt: item.createdAt ? new Date(item.createdAt as string | number) : new Date(),
    updatedAt: item.updatedAt ? new Date(item.updatedAt as string | number) : new Date(),
  })) as ModuleItem[];
}

const MODULE_CATEGORY_FALLBACK_NAMES = ['Punching', 'Kicking', 'Elbow Strikes', 'Knee Strikes', 'Defensive Moves'] as const;

function normalizeCategory(cat: string | undefined): string {
  const s = (cat ?? '').trim().toLowerCase();
  return s === 'jab' ? 'punching' : s;
}

function toCategoryProgramKey(category: string | undefined): string {
  return String(category ?? '')
    .trim()
    .toLowerCase()
    .replace(/[#$.[\]\/]/g, '_');
}

/** Dynamic module fields from Firestore (not all declared on {@link ModuleItem}). */
function moduleDyn(mod: ModuleItem): Record<string, unknown> {
  return mod as unknown as Record<string, unknown>;
}

/** Bundled asset or remote URL string → valid {@link Image} source. */
function toImageSource(source: ImageSourcePropType | string | null | undefined): ImageSourcePropType | undefined {
  if (source == null) return undefined;
  if (typeof source === 'string') return source.length ? { uri: source } : undefined;
  return source;
}

function extractRemoteUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const keys = ['url', 'uri', 'secure_url', 'secureUrl', 'downloadURL', 'downloadUrl'];
  for (const key of keys) {
    const nested = obj[key];
    if (typeof nested === 'string') {
      const trimmed = nested.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    }
  }
  return null;
}

function getModuleIntroductionVideoUrl(mod: ModuleItem | null | undefined): string | null {
  if (!mod) return null;
  const r = moduleDyn(mod);
  return (
    extractRemoteUrl(r.video_introduction) ||
    extractRemoteUrl(r.videoIntroduction) ||
    extractRemoteUrl(r.introductionVideoUrl) ||
    extractRemoteUrl(r.techniqueVideoUrl)
  );
}

function isTrainingModuleOnly(mod: ModuleItem): boolean {
  const r = moduleDyn(mod);
  const segment = String(r.moduleSegment ?? r.module_segment ?? '').trim().toLowerCase();
  if (segment === 'warmup' || segment === 'cooldown' || segment === 'introduction') return false;
  const title = String(mod.moduleTitle ?? '').trim().toLowerCase();
  if (title === 'intro' || title.includes('introduction')) return false;
  return true;
}

function normalizeExerciseKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildExerciseKeyVariants(value: string): string[] {
  const base = normalizeExerciseKey(value);
  if (!base) return [];
  const out = new Set<string>();
  out.add(base);
  out.add(base.replace(/\s+/g, ''));
  const words = base.split(' ').filter(Boolean);
  if (words.length > 0) {
    const singularWords = words.map((w) => (w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w));
    const singular = singularWords.join(' ');
    out.add(singular);
    out.add(singular.replace(/\s+/g, ''));
  }
  return Array.from(out);
}

function setThumbnailWithVariants(map: Map<string, string>, exerciseName: string, url: string): void {
  for (const key of buildExerciseKeyVariants(exerciseName)) {
    map.set(key, url);
  }
}

function resolveThumbnailWithVariants(map: Map<string, string>, exerciseName: string): string | undefined {
  const variants = buildExerciseKeyVariants(exerciseName);
  for (const key of variants) {
    const value = map.get(key);
    if (value) return value;
  }
  return undefined;
}

function readExerciseThumbnailMap(
  source: unknown,
  fallbackExerciseNames: string[]
): Map<string, string> {
  const out = new Map<string, string>();
  if (!source) return out;

  if (Array.isArray(source)) {
    source.forEach((entry, idx) => {
      if (entry == null) return;
      if (typeof entry === 'string') {
        const url = extractRemoteUrl(entry);
        const name = fallbackExerciseNames[idx]?.trim().toLowerCase();
        if (url && name) out.set(name, url);
        return;
      }
      if (typeof entry === 'object') {
        const item = entry as Record<string, unknown>;
        const nameCandidate =
          typeof item.exercise === 'string'
            ? item.exercise
            : typeof item.name === 'string'
              ? item.name
              : typeof item.title === 'string'
                ? item.title
                : fallbackExerciseNames[idx];
        const urlCandidate =
          extractRemoteUrl(item.thumbnailUrl) ||
          extractRemoteUrl(item.thumbnailURL) ||
          extractRemoteUrl(item.thumbnail) ||
          extractRemoteUrl(item.thumb) ||
          extractRemoteUrl(item.image) ||
          extractRemoteUrl(item.imageUrl) ||
          extractRemoteUrl(item.url) ||
          extractRemoteUrl(item.media);
        const name = String(nameCandidate ?? '').trim().toLowerCase();
        if (name && urlCandidate) out.set(name, urlCandidate);
      }
    });
    return out;
  }

  if (typeof source === 'object') {
    const obj = source as Record<string, unknown>;
    const entries = Object.entries(obj);
    let numericEntryIndex = 0;
    for (const [key, value] of entries) {
      const isNumericKey = /^\d+$/.test(key.trim());
      const direct = extractRemoteUrl(value);
      if (direct) {
        const fallbackName = fallbackExerciseNames[numericEntryIndex]?.trim().toLowerCase();
        if (isNumericKey && fallbackName) setThumbnailWithVariants(out, fallbackName, direct);
        else setThumbnailWithVariants(out, key.trim().toLowerCase(), direct);
        if (isNumericKey) numericEntryIndex++;
        continue;
      }
      if (!value || typeof value !== 'object') continue;
      const nested = value as Record<string, unknown>;
      const nestedName =
        typeof nested.exercise === 'string'
          ? nested.exercise
          : typeof nested.exerciseName === 'string'
            ? nested.exerciseName
          : typeof nested.name === 'string'
            ? nested.name
            : typeof nested.label === 'string'
              ? nested.label
            : typeof nested.title === 'string'
              ? nested.title
                : isNumericKey
                  ? fallbackExerciseNames[numericEntryIndex]
                  : key;
      const nestedUrl =
        extractRemoteUrl(nested.thumbnailUrl) ||
        extractRemoteUrl(nested.thumbnailURL) ||
        extractRemoteUrl(nested.thumbnail) ||
        extractRemoteUrl(nested.thumb) ||
        extractRemoteUrl(nested.image) ||
        extractRemoteUrl(nested.imageUrl) ||
        extractRemoteUrl(nested.url) ||
        extractRemoteUrl(nested.media);
      const finalName = String(nestedName ?? '').trim().toLowerCase();
      if (finalName && nestedUrl) setThumbnailWithVariants(out, finalName, nestedUrl);
      if (isNumericKey) numericEntryIndex++;
    }
  }
  return out;
}

/** Animated category card for horizontal strip: hero image, gradient, glow border, press scale, slide-in. */
function TrainingCategoryCard({
  category,
  thumbnailUrl,
  moduleCount,
  onPress,
  index = 0,
  cardWidth,
}: {
  category: string;
  thumbnailUrl?: string | null;
  moduleCount: number;
  onPress: () => void;
  index?: number;
  cardWidth: number;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(32)).current;
  const [remoteImageError, setRemoteImageError] = useState(false);
  const [bundledImageError, setBundledImageError] = useState(false);
  const remoteImageSource = !remoteImageError ? toImageSource(thumbnailUrl ?? undefined) : undefined;
  const bundledImageSource = !bundledImageError ? CATEGORY_IMAGES[category] : undefined;
  const imageSource = remoteImageSource ?? bundledImageSource;
  const showImage = imageSource != null;

  useEffect(() => {
    setRemoteImageError(false);
    setBundledImageError(false);
  }, [category, thumbnailUrl]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 380,
        delay: index * 70,
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        delay: index * 70,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
    ]).start();
  }, [index, opacityAnim, translateX]);

  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 100,
      bounciness: 0,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 80,
      bounciness: 6,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.horizontalCardTouch, { width: cardWidth }]}
    >
      <Animated.View
        style={[
          styles.categoryCard,
          styles.categoryCardHorizontal,
          { width: cardWidth, opacity: opacityAnim, transform: [{ translateX }, { scale: scaleAnim }] },
        ]}
      >
        <View style={styles.categoryCardGlow} pointerEvents="none" />
        <View style={[styles.categoryCardImageWrap, styles.categoryCardImageWrapHorizontal]}>
          {showImage ? (
            <Image
              source={imageSource}
              style={styles.categoryCardImage}
              resizeMode="cover"
              onError={() => {
                if (remoteImageSource) setRemoteImageError(true);
                else setBundledImageError(true);
              }}
            />
          ) : (
            <View style={styles.categoryCardImagePlaceholder}>
              <Text style={styles.categoryCardPlaceholderIcon}>🥋</Text>
            </View>
          )}
          <View style={styles.categoryCardGradient} pointerEvents="none" />
          <View style={styles.categoryCardContent} pointerEvents="none">
            <Text style={styles.categoryCardTitle} numberOfLines={1}>{category}</Text>
            <View style={styles.categoryCardCountRow}>
              <View style={styles.categoryCardCountPill}>
                <Text style={styles.categoryCardCount}>
                  {moduleCount} module{moduleCount !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={styles.categoryCardChevron}>›</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// --- Types ---
interface DashboardScreenProps {
  onOpenModule: (moduleId: string, initialModule?: ModuleItem) => void;
  onOpenTopUp?: () => void;
  onStartCategorySession: (payload: {
    category: string;
    warmups: string[];
    cooldowns: string[];
    trainingModules: ModuleItem[];
    introductionVideoUrl?: string | null;
    startPhase?: 'warmup' | 'cooldown' | 'introduction' | 'training';
    mannequinGifUri?: string | null;
    initialWarmupIndex?: number;
    initialCooldownIndex?: number;
    initialTrainingIndex?: number;
    sessionVariant?: 'default' | 'recommendedSingle';
    /** When false, returning from the session does not reopen the category overlay (e.g. opened from day history). */
    returnToCategoryAfterExit?: boolean;
  }) => void;
  /** Category-style session (safety → countdown → pose) for a single pick from Recommended modal. */
  onStartRecommendedSingleSession?: (module: ModuleItem) => void;
  /** Increment when returning from recommended single session so the modal reopens. */
  recommendationsReopenToken?: number;
  /** Call after opening the modal from `recommendationsReopenToken` so the token can be cleared in App (prevents reopen after category quit). */
  onConsumeRecommendationsReopen?: () => void;
  /** When this changes (e.g. after returning from a module), progress is refetched so weekly goal updates. */
  refreshKey?: number;
  returnToCategory?: string | null;
  onConsumeReturnToCategory?: () => void;
  /** Shown once when landing on dashboard (e.g. after publishing a module). */
  initialToastMessage?: string | null;
  onClearInitialToast?: () => void;
  onModulePurchaseComplete?: (payload: { invoice: ModulePurchaseInvoice; newCredits: number }) => void;
  onCreditsUpdated?: (newCredits: number) => void;
}

// --- Component ---
export default function DashboardScreen({
  onOpenModule,
  onOpenTopUp,
  onStartCategorySession,
  onStartRecommendedSingleSession,
  recommendationsReopenToken = 0,
  onConsumeRecommendationsReopen,
  refreshKey = 0,
  returnToCategory = null,
  onConsumeReturnToCategory,
  initialToastMessage,
  onClearInitialToast,
  onModulePurchaseComplete,
  onCreditsUpdated,
}: DashboardScreenProps) {
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [moduleCategories, setModuleCategories] = useState<ModuleCategoryWithMeta[]>([]);
  const [categorySegmentProgram, setCategorySegmentProgram] = useState<Record<string, { warmupModuleIds?: string[]; cooldownModuleIds?: string[] }>>({});
  const [recommendedModules, setRecommendedModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryLoadError, setCategoryLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedRemoteImageError, setExpandedRemoteImageError] = useState(false);
  const [expandedBundledImageError, setExpandedBundledImageError] = useState(false);
  // -1 means: nothing selected yet; session starts from index 0.
  const [warmupStartCardIndex, setWarmupStartCardIndex] = useState<number>(-1);
  const [cooldownStartCardIndex, setCooldownStartCardIndex] = useState<number>(-1);
  const [trainingStartCardIndex, setTrainingStartCardIndex] = useState<number>(-1);
  const [introductionStartCardIndex, setIntroductionStartCardIndex] = useState<number>(-1);
  const [completionTimestamps, setCompletionTimestamps] = useState<Record<string, number>>({});
  const [completedModuleIds, setCompletedModuleIds] = useState<string[]>([]);
  const [moduleTrainingStats, setModuleTrainingStats] = useState<Record<string, ModuleTrainingStat>>({});
  const [skillProfile, setSkillProfile] = useState<SkillProfile | null>(null);
  const [mlRecommendedModuleIds, setMlRecommendedModuleIds] = useState<string[]>([]);
  const [recModalVisible, setRecModalVisible] = useState(false);
  const [recDetailModalVisible, setRecDetailModalVisible] = useState(false);
  const [recDetailModule, setRecDetailModule] = useState<ModuleItem | null>(null);
  const [dayHistoryModalVisible, setDayHistoryModalVisible] = useState(false);
  const [dayHistoryDayIndex, setDayHistoryDayIndex] = useState(0);
  const lastWeekdayTapRef = useRef<{ index: number; at: number } | null>(null);
  const lastWarmupTapRef = useRef<{ index: number; at: number }>({ index: -1, at: 0 });
  const lastCooldownTapRef = useRef<{ index: number; at: number }>({ index: -1, at: 0 });
  /** Tracks the last tap on a Training card so a quick second tap (double-tap) starts the session immediately. */
  const lastTrainingTapRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  /** Bumps when the local Mon–Sun week rolls so weekly bars + day history match the new window (same as weekly goal). */
  const [weekBoundaryTick, setWeekBoundaryTick] = useState(0);
  const lastWeekStartMsRef = useRef(getCurrentWeekStartMs());
  const [targetModulesPerDay, setTargetModulesPerDay] = useState(DEFAULT_MODULES_PER_DAY_GOAL);
  const [targetModulesPerWeek, setTargetModulesPerWeek] = useState(DEFAULT_MODULES_PER_WEEK_GOAL);
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasedModuleIds, setPurchasedModuleIds] = useState<string[]>([]);
  const [userCredits, setUserCredits] = useState(0);
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const [purchaseTargetModule, setPurchaseTargetModule] = useState<ModuleItem | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [weeklyReward, setWeeklyReward] = useState<WeeklyReward | null>(null);
  const [weeklyRewardModalVisible, setWeeklyRewardModalVisible] = useState(false);
  const [claimingWeeklyReward, setClaimingWeeklyReward] = useState(false);
  const [categoryReviewPrompt, setCategoryReviewPrompt] = useState<{ category: string; trainers: Array<{ uid: string; name: string }> } | null>(null);
  const [trainerRatings, setTrainerRatings] = useState<Record<string, number>>({});
  const [trainerPhotoByUid, setTrainerPhotoByUid] = useState<Record<string, string>>({});
  const [submittingCategoryReview, setSubmittingCategoryReview] = useState(false);

  const canSubmitCategoryTrainerRatings = React.useMemo(() => {
    const prompt = categoryReviewPrompt;
    if (!prompt?.trainers?.length) return false;
    return prompt.trainers.some((t) => {
      const v = trainerRatings[t.uid] ?? 0;
      return v >= 1 && v <= 5;
    });
  }, [categoryReviewPrompt, trainerRatings]);

  const checkPendingCategoryReviewPrompt = React.useCallback(async () => {
    const prompt = await AuthController.popCategoryReviewPrompt();
    if (!prompt) return;
    const existing = await AuthController.getMyCategoryReview(prompt.category);
    const existingRatings = existing?.trainerRatings ?? {};
    const unratedTrainers = prompt.trainers.filter((t) => {
      const v = Number(existingRatings[t.uid]);
      return !(Number.isFinite(v) && v >= 1 && v <= 5);
    });
    if (unratedTrainers.length === 0) return;
    const approvedTrainers = await AuthController.getApprovedTrainers().catch(() => []);
    const photoMap: Record<string, string> = {};
    for (const t of approvedTrainers) {
      const url = String(t.profilePicture ?? '').trim();
      if (url.startsWith('http://') || url.startsWith('https://')) photoMap[t.uid] = url;
    }
    setTrainerPhotoByUid(photoMap);
    setCategoryReviewPrompt({ category: prompt.category, trainers: unratedTrainers });
    const initial: Record<string, number> = {};
    for (const t of unratedTrainers) {
      initial[t.uid] = 0;
    }
    setTrainerRatings(initial);
  }, []);

  useEffect(() => {
    if (recommendationsReopenToken <= 0) return;
    setRecModalVisible(true);
    onConsumeRecommendationsReopen?.();
  }, [recommendationsReopenToken, onConsumeRecommendationsReopen]);

  useEffect(() => {
    checkPendingCategoryReviewPrompt().catch(() => {});
  }, [refreshKey, checkPendingCategoryReviewPrompt]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPendingCategoryReviewPrompt().catch(() => {});
      }
    });
    const interval = setInterval(() => {
      if (categoryReviewPrompt) return;
      checkPendingCategoryReviewPrompt().catch(() => {});
    }, 1800);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [categoryReviewPrompt, checkPendingCategoryReviewPrompt]);

  useEffect(() => {
    const syncWeekBoundary = () => {
      const start = getCurrentWeekStartMs();
      if (lastWeekStartMsRef.current === start) return;
      lastWeekStartMsRef.current = start;
      setWeekBoundaryTick((n) => n + 1);
      setDayHistoryModalVisible(false);
      lastWeekdayTapRef.current = null;
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncWeekBoundary();
    });
    const interval = setInterval(syncWeekBoundary, WEEK_BOUNDARY_POLL_MS);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, []);

  const loadDashboardData = React.useCallback(async () => {
    const LOAD_TIMEOUT_MS = 10000;
    let done = false;
    const timeoutId = setTimeout(() => {
      if (done) return;
      done = true;
      setLoading(false);
      setRefreshing(false);
    }, LOAD_TIMEOUT_MS);

    try {
      // Show cached modules immediately so the user sees the list while we fetch fresh data.
      const cached = await AsyncStorage.getItem(MODULES_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const revived = reviveCachedModules(parsed);
          if (revived.length > 0) {
            setModules(revived);
            setLoading(false);
          }
        } catch (_) {
          // ignore invalid cache
        }
      }

      // Load modules and progress (query only approved, so payload is smaller).
      const [list, progress, currentUser, fullProfile, purchased, liveCredits, segmentProgram, categoriesWithMeta] = await Promise.all([
        AuthController.getApprovedModules(),
        AuthController.getUserProgress(),
        AuthController.getCurrentUser(),
        AuthController.getFullSkillProfile(),
        getPurchasedModuleIds(),
        getUserCreditsBalance(),
        AuthController.getCategorySegmentProgram(),
        AuthController.getModuleCategoriesWithMeta(),
      ]);
      if (done) return;
      const completedIds = Array.isArray(progress?.completedModuleIds) ? progress.completedModuleIds : [];
      setModules(list ?? []);
      const fallbackCategories = MODULE_CATEGORY_FALLBACK_NAMES.map((name) => ({
        key: toCategoryProgramKey(name),
        name,
        thumbnailUrl: null,
      }));
      if (Array.isArray(categoriesWithMeta) && categoriesWithMeta.length > 0) {
        setModuleCategories(categoriesWithMeta);
        setCategoryLoadError(null);
      } else {
        setModuleCategories(fallbackCategories);
        setCategoryLoadError('Category metadata unavailable. Showing default category cards.');
      }
      setCompletionTimestamps(progress?.completionTimestamps ?? {});
      setCompletedModuleIds(completedIds);
      setModuleTrainingStats(progress?.moduleTrainingStats ?? {});
      const reward = (progress as { weeklyReward?: WeeklyReward | null } | null)?.weeklyReward ?? null;
      setWeeklyReward(reward);
      const currentWeekKey = getCurrentWeekKey();
      const hasUnclaimedRewardThisWeek = reward?.weekKey === currentWeekKey && reward.claimedAt == null;
      setWeeklyRewardModalVisible(hasUnclaimedRewardThisWeek);
      setSkillProfile(fullProfile);
      setPurchasedModuleIds(purchased);
      setUserCredits(liveCredits);
      setCategorySegmentProgram(segmentProgram ?? {});
      const dailyTarget = currentUser?.targetModulesPerDay && currentUser.targetModulesPerDay > 0
        ? currentUser.targetModulesPerDay
        : DEFAULT_MODULES_PER_DAY_GOAL;
      const weeklyTarget = currentUser?.targetModulesPerWeek && currentUser.targetModulesPerWeek > 0
        ? currentUser.targetModulesPerWeek
        : dailyTarget * 7;
      setTargetModulesPerDay(dailyTarget);
      setTargetModulesPerWeek(weeklyTarget);
      setLoading(false);
      setRefreshing(false);
      done = true;
      clearTimeout(timeoutId);

      if (list?.length) {
        AsyncStorage.setItem(MODULES_CACHE_KEY, JSON.stringify(list)).catch(() => {});
      }

      // Load recommendations in background (don't block showing the module list).
      AuthController.getRecommendations()
        .then((recs) => {
          const ids = Array.isArray(recs?.recommendedModuleIds) ? recs!.recommendedModuleIds : [];
          setMlRecommendedModuleIds(ids);
          if (!ids.length) {
            setRecommendedModules([]);
            return;
          }
          return AuthController.getModulesByIds(ids).then((recommended) => {
            const notCompleted = recommended.filter((m) => !completedIds.includes(m.moduleId));
            const trainingOnly = notCompleted.filter(isTrainingModuleOnly);
            setRecommendedModules(trainingOnly);
          });
        })
        .catch(() => {
          setMlRecommendedModuleIds([]);
          setRecommendedModules([]);
        });
    } catch (e) {
      if (!done) setModules([]);
      setModuleCategories(
        MODULE_CATEGORY_FALLBACK_NAMES.map((name) => ({
          key: toCategoryProgramKey(name),
          name,
          thumbnailUrl: null,
        }))
      );
      setCategoryLoadError('Unable to refresh categories right now.');
      done = true;
      clearTimeout(timeoutId);
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadDashboardData();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [refreshKey, loadDashboardData]);

  useEffect(() => {
    if (initialToastMessage && onClearInitialToast) {
      showToast(initialToastMessage);
      onClearInitialToast();
    }
  }, [initialToastMessage, onClearInitialToast, showToast]);

  useEffect(() => {
    if (!returnToCategory) return;
    setSelectedCategory(returnToCategory);
    onConsumeReturnToCategory?.();
  }, [onConsumeReturnToCategory, returnToCategory]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadDashboardData();
  }, [loadDashboardData]);

  const handleClaimWeeklyReward = React.useCallback(async () => {
    if (claimingWeeklyReward) return;
    setClaimingWeeklyReward(true);
    try {
      const result = await AuthController.claimWeeklyGoalReward();
      if (!result.claimed) {
        setWeeklyRewardModalVisible(false);
        return;
      }
      setUserCredits(result.newCredits);
      onCreditsUpdated?.(result.newCredits);
      setWeeklyReward(result.weeklyReward);
      setWeeklyRewardModalVisible(false);
      showToast(`Congrats! You claimed ${result.creditsAwarded} credits.`);
    } catch (e) {
      showToast((e as Error)?.message || 'Could not claim reward. Please try again.');
    } finally {
      setClaimingWeeklyReward(false);
    }
  }, [claimingWeeklyReward, onCreditsUpdated, showToast]);

  const handleWeekdayPress = React.useCallback((dayIndex: number) => {
    const now = Date.now();
    const prev = lastWeekdayTapRef.current;
    if (prev && prev.index === dayIndex && now - prev.at < DAY_DOUBLE_TAP_MS) {
      lastWeekdayTapRef.current = null;
      setSelectedDay(dayIndex);
      setDayHistoryDayIndex(dayIndex);
      setDayHistoryModalVisible(true);
      return;
    }
    lastWeekdayTapRef.current = { index: dayIndex, at: now };
    setSelectedDay(dayIndex);
  }, []);

  const todayIndex = (new Date().getDay() + 6) % 7;
  const dayCounts = getDayCountsThisWeek(completionTimestamps);
  const dayProgress = dayCounts.map((c) => Math.min(1, c / targetModulesPerDay));
  const weeklyCompletions = dayCounts.reduce((sum, count) => sum + count, 0);
  const weeklyProgress = Math.min(1, weeklyCompletions / targetModulesPerWeek);

  const personalizedRecIds = React.useMemo(
    () =>
      buildPersonalizedModuleRecommendations({
        modules,
        skillProfile,
        completedModuleIds,
        moduleTrainingStats,
        mlRecommendedModuleIds,
        topN: 5,
      }),
    [modules, skillProfile, completedModuleIds, moduleTrainingStats, mlRecommendedModuleIds]
  );

  const personalizedRecModules = React.useMemo(() => {
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    const primary = personalizedRecIds
      .map((id) => byId.get(id))
      .filter((m): m is ModuleItem => m != null)
      .filter(isTrainingModuleOnly);

    const selected = new Map(primary.map((m) => [m.moduleId, m]));
    if (selected.size >= 5) return Array.from(selected.values()).slice(0, 5);

    // Backfill to always show up to 5 training modules (never warmup/cooldown/introduction).
    const fallbackPool = modules
      .filter((m) => isTrainingModuleOnly(m))
      .filter((m) => !completedModuleIds.includes(m.moduleId))
      .filter((m) => !selected.has(m.moduleId));

    for (const mod of fallbackPool) {
      if (selected.size >= 5) break;
      selected.set(mod.moduleId, mod);
    }

    return Array.from(selected.values()).slice(0, 5);
  }, [modules, personalizedRecIds, completedModuleIds]);

  const recDetailReasons = React.useMemo(() => {
    if (!recDetailModule) return [];
    const reasons: string[] = [];
    const failCount = moduleTrainingStats[recDetailModule.moduleId]?.failCount ?? 0;
    const categoryLabel = recDetailModule.category?.trim() || 'Training';
    if (failCount > 0) {
      reasons.push(`Needs practice: ${failCount} incomplete training session${failCount === 1 ? '' : 's'} detected.`);
    }
    if (skillProfile) {
      reasons.push('Matched with your skill profile answers for experience level and current fitness level.');
      reasons.push('Matched with your selected preferences: preferred technique and training goals.');
      reasons.push('Adjusted for your limitations/injuries to avoid high-demand mismatch.');
    } else {
      reasons.push('Skill profile is incomplete, so this is currently based more on similar learners and progress history.');
    }
    reasons.push(`Category fit: ${categoryLabel}.`);
    reasons.push(
      completedModuleIds.length >= PERFORMANCE_PHASE_COMPLETION_THRESHOLD
        ? 'Your training performance now has stronger weight after several completed modules.'
        : 'As you complete more modules, training performance will gain stronger weight.'
    );
    return reasons;
  }, [recDetailModule, moduleTrainingStats, skillProfile, completedModuleIds.length]);

  const openRecommendedReason = React.useCallback((mod: ModuleItem) => {
    setRecDetailModule(mod);
    setRecDetailModalVisible(true);
  }, []);

  const continueRecommendedFlow = React.useCallback(() => {
    if (!recDetailModule) return;
    setRecDetailModalVisible(false);
    setRecModalVisible(false);
    const cat = recDetailModule.category?.trim() ? recDetailModule.category : 'Punching';
    onStartCategorySession({
      category: cat,
      warmups: [],
      cooldowns: [],
      trainingModules: [recDetailModule],
      introductionVideoUrl: getCategoryIntroductionVideoUrl(cat),
      mannequinGifUri: extractRemoteUrl(moduleDyn(recDetailModule).referenceGuideUrl),
      sessionVariant: 'recommendedSingle',
    });
  }, [recDetailModule, onStartCategorySession]);

  const dayHistoryEntries = React.useMemo(
    () => getCompletedModulesForWeekdayThisWeek(dayHistoryDayIndex, completionTimestamps),
    [dayHistoryDayIndex, completionTimestamps, weekBoundaryTick]
  );

  const approvedModuleById = React.useMemo(() => {
    const map = new Map<string, ModuleItem>();
    for (const m of modules) map.set(m.moduleId, m);
    return map;
  }, [modules]);

  const selectedCategoryKey = selectedCategory ? toCategoryProgramKey(selectedCategory) : '';
  const selectedCategoryProgramRow = selectedCategory ? categorySegmentProgram[selectedCategoryKey] : undefined;

  const assignedWarmupModules = React.useMemo(() => {
    if (!selectedCategoryProgramRow?.warmupModuleIds?.length) return [] as ModuleItem[];
    const out: ModuleItem[] = [];
    for (const id of selectedCategoryProgramRow.warmupModuleIds) {
      const mod = approvedModuleById.get(String(id).trim());
      if (!mod) continue;
      if (String(moduleDyn(mod).moduleSegment ?? '').trim().toLowerCase() !== 'warmup') continue;
      out.push(mod);
    }
    return out;
  }, [approvedModuleById, selectedCategoryProgramRow]);

  const assignedCooldownModules = React.useMemo(() => {
    if (!selectedCategoryProgramRow?.cooldownModuleIds?.length) return [] as ModuleItem[];
    const out: ModuleItem[] = [];
    for (const id of selectedCategoryProgramRow.cooldownModuleIds) {
      const mod = approvedModuleById.get(String(id).trim());
      if (!mod) continue;
      if (String(moduleDyn(mod).moduleSegment ?? '').trim().toLowerCase() !== 'cooldown') continue;
      out.push(mod);
    }
    return out;
  }, [approvedModuleById, selectedCategoryProgramRow]);

  const modulesInCategoryRaw = selectedCategory
    ? modules.filter(
        (m) =>
          normalizeCategory(m.category) === normalizeCategory(selectedCategory) &&
          !String(moduleDyn(m).moduleSegment ?? '').trim()
      )
    : [];
  const techniqueModulesInCategory = [...modulesInCategoryRaw].sort((a, b) => {
    const sa = (a as any).sortOrder;
    const sb = (b as any).sortOrder;
    const aNum = typeof sa === 'number' ? sa : null;
    const bNum = typeof sb === 'number' ? sb : null;
    if (aNum != null && bNum != null) return aNum - bNum;
    if (aNum != null) return -1;
    if (bNum != null) return 1;
    return 0;
  });
  // Backward-safe alias used by older runtime references during fast refresh.
  const modulesInCategory = techniqueModulesInCategory;
  const unlockedModuleIdsByCategory = React.useMemo(() => {
    const byCategory = new Map<string, ModuleItem[]>();
    for (const mod of modules) {
      if (String(moduleDyn(mod).moduleSegment ?? '').trim()) continue;
      const key = normalizeCategory(mod.category);
      const existing = byCategory.get(key);
      if (existing) existing.push(mod);
      else byCategory.set(key, [mod]);
    }
    const unlocked = new Set<string>();
    for (const [, mods] of byCategory) {
      const sorted = [...mods].sort((a, b) => {
        const sa = (a as { sortOrder?: unknown }).sortOrder;
        const sb = (b as { sortOrder?: unknown }).sortOrder;
        const aNum = typeof sa === 'number' ? sa : Number.MAX_SAFE_INTEGER;
        const bNum = typeof sb === 'number' ? sb : Number.MAX_SAFE_INTEGER;
        if (aNum !== bNum) return aNum - bNum;
        return String(a.moduleTitle ?? '').localeCompare(String(b.moduleTitle ?? ''));
      });
      if (sorted[0]?.moduleId) unlocked.add(sorted[0].moduleId);
    }
    return unlocked;
  }, [modules]);
  const isModuleLocked = React.useCallback(
    (moduleId: string) => !unlockedModuleIdsByCategory.has(moduleId) && !purchasedModuleIds.includes(moduleId),
    [unlockedModuleIdsByCategory, purchasedModuleIds]
  );
  const getPayableModulesForCategory = React.useCallback((category: string): ModuleItem[] => {
    const categoryModules = modules.filter(
      (m) =>
        normalizeCategory(m.category) === normalizeCategory(category) &&
        !String(moduleDyn(m).moduleSegment ?? '').trim()
    );
    return categoryModules.filter((m) => !unlockedModuleIdsByCategory.has(m.moduleId));
  }, [modules, unlockedModuleIdsByCategory]);
  const getCategoryBuyAllPrice = React.useCallback((category: string): number => {
    const payable = getPayableModulesForCategory(category);
    const alreadyPurchasedCount = payable.filter((m) => purchasedModuleIds.includes(m.moduleId)).length;
    const remainingCount = Math.max(0, payable.length - alreadyPurchasedCount);
    return remainingCount * 50;
  }, [getPayableModulesForCategory, purchasedModuleIds]);

  const warmupTop3Values = assignedWarmupModules.length
    ? [...assignedWarmupModules.map((m) => String(m.moduleTitle ?? '').trim()).filter(Boolean), '—', '—', '—'].slice(0, 3)
    : ['—', '—', '—'];
  const cooldownTop3Values = assignedCooldownModules.length
    ? [...assignedCooldownModules.map((m) => String(m.moduleTitle ?? '').trim()).filter(Boolean), '—', '—', '—'].slice(0, 3)
    : ['—', '—', '—'];
  const selectedCategoryMeta = React.useMemo(
    () => moduleCategories.find((row) => normalizeCategory(row.name) === normalizeCategory(selectedCategory ?? '')) ?? null,
    [moduleCategories, selectedCategory]
  );
  const selectedCategoryRemoteImageSource = !expandedRemoteImageError
    ? toImageSource(selectedCategoryMeta?.thumbnailUrl ?? undefined)
    : undefined;
  const selectedCategoryBundledImageSource = !expandedBundledImageError && selectedCategory
    ? CATEGORY_IMAGES[selectedCategory]
    : undefined;
  const selectedCategoryHeroImageSource = selectedCategoryRemoteImageSource ?? selectedCategoryBundledImageSource;

  const warmupModuleThumbByTitle = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const mod of modules) {
      const r = moduleDyn(mod);
      const segment = String(r.moduleSegment ?? '').trim().toLowerCase();
      if (segment !== 'warmup') continue;
      const title = String(r.moduleTitle ?? '').trim().toLowerCase();
      const thumb = extractRemoteUrl(r.thumbnailUrl) || extractRemoteUrl(r.thumbnailURL);
      if (title && thumb) setThumbnailWithVariants(map, title, thumb);
    }
    return map;
  }, [modules]);

  const cooldownModuleThumbByTitle = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const mod of modules) {
      const r = moduleDyn(mod);
      const segment = String(r.moduleSegment ?? '').trim().toLowerCase();
      if (segment !== 'cooldown') continue;
      const title = String(r.moduleTitle ?? '').trim().toLowerCase();
      const thumb = extractRemoteUrl(r.thumbnailUrl) || extractRemoteUrl(r.thumbnailURL);
      if (title && thumb) setThumbnailWithVariants(map, title, thumb);
    }
    return map;
  }, [modules]);

  const warmupModuleGuideByTitle = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const mod of modules) {
      const r = moduleDyn(mod);
      const segment = String(r.moduleSegment ?? '').trim().toLowerCase();
      if (segment !== 'warmup') continue;
      const title = String(r.moduleTitle ?? '').trim().toLowerCase();
      const guide = extractRemoteUrl(r.referenceGuideUrl);
      if (title && guide) setThumbnailWithVariants(map, title, guide);
    }
    return map;
  }, [modules]);

  const cooldownModuleGuideByTitle = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const mod of modules) {
      const r = moduleDyn(mod);
      const segment = String(r.moduleSegment ?? '').trim().toLowerCase();
      if (segment !== 'cooldown') continue;
      const title = String(r.moduleTitle ?? '').trim().toLowerCase();
      const guide = extractRemoteUrl(r.referenceGuideUrl);
      if (title && guide) setThumbnailWithVariants(map, title, guide);
    }
    return map;
  }, [modules]);

  const warmupThumbnailByExercise = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const mod of techniqueModulesInCategory) {
      const r = moduleDyn(mod);
      const exerciseList = Array.isArray(r.warmupExercises) ? r.warmupExercises.map((v) => String(v)) : [];
      const moduleWarmupMap = readExerciseThumbnailMap(r.module_warmup, exerciseList);
      moduleWarmupMap.forEach((url, key) => map.set(key, url));
      const candidateMaps = [
        r.warmupThumbnails,
        r.warmupThumbnailMap,
        r.warmupImages,
        r.warmupImageMap,
      ];
      for (const candidate of candidateMaps) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
        const obj = candidate as Record<string, unknown>;
        for (const [exerciseName, value] of Object.entries(obj)) {
          const url = extractRemoteUrl(value);
          if (url) map.set(exerciseName.trim().toLowerCase(), url);
        }
      }
      const candidateArrays = [
        r.warmupThumbnailUrls,
        r.warmupImageUrls,
        r.warmupThumbnailsList,
      ];
      for (const arr of candidateArrays) {
        if (!Array.isArray(arr)) continue;
        arr.forEach((value, idx) => {
          const exerciseName = exerciseList[idx];
          const url = extractRemoteUrl(value);
          if (exerciseName && url) map.set(exerciseName.trim().toLowerCase(), url);
        });
      }
    }
    return map;
  }, [techniqueModulesInCategory]);

  const cooldownThumbnailByExercise = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const mod of techniqueModulesInCategory) {
      const r = moduleDyn(mod);
      const exerciseList = Array.isArray(r.cooldownExercises) ? r.cooldownExercises.map((v) => String(v)) : [];
      const moduleCooldownMap = readExerciseThumbnailMap(r.module_cooldown, exerciseList);
      moduleCooldownMap.forEach((url, key) => map.set(key, url));
      const candidateMaps = [
        r.cooldownThumbnails,
        r.cooldownThumbnailMap,
        r.cooldownImages,
        r.cooldownImageMap,
      ];
      for (const candidate of candidateMaps) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
        const obj = candidate as Record<string, unknown>;
        for (const [exerciseName, value] of Object.entries(obj)) {
          const url = extractRemoteUrl(value);
          if (url) map.set(exerciseName.trim().toLowerCase(), url);
        }
      }
      const candidateArrays = [
        r.cooldownThumbnailUrls,
        r.cooldownImageUrls,
        r.cooldownThumbnailsList,
      ];
      for (const arr of candidateArrays) {
        if (!Array.isArray(arr)) continue;
        arr.forEach((value, idx) => {
          const exerciseName = exerciseList[idx];
          const url = extractRemoteUrl(value);
          if (exerciseName && url) map.set(exerciseName.trim().toLowerCase(), url);
        });
      }
    }
    return map;
  }, [techniqueModulesInCategory]);

  useEffect(() => {
    // Reset the "start from here" warmup selection whenever the user changes category.
    setWarmupStartCardIndex(-1);
    setCooldownStartCardIndex(-1);
    setTrainingStartCardIndex(-1);
    setIntroductionStartCardIndex(-1);
    lastWarmupTapRef.current = { index: -1, at: 0 };
    lastCooldownTapRef.current = { index: -1, at: 0 };
    setExpandedRemoteImageError(false);
    setExpandedBundledImageError(false);
  }, [selectedCategory]);

  function groupByDifficulty<T extends { difficultyLevel?: string | null }>(
    list: T[],
    category: string | null,
    introItems: T[]
  ): { level: 'basic' | 'intermediate' | 'advanced' | 'cooldown' | 'other' | 'introduction'; label: string; items: T[] }[] {
    // Consistent session flow across all categories:
    // Warmup/Introduction/Cooldown sections are placeholders/cards;
    // all real technique modules are practiced in Training.
    return [
      { level: 'intermediate', label: 'Warmup', items: [] },
      { level: 'introduction', label: 'Introduction', items: [...introItems] },
      { level: 'advanced', label: 'Training', items: [...list] },
      { level: 'cooldown', label: 'Cooldown', items: [] },
    ];
  }
  const introductionModuleForCategory = React.useMemo(() => {
    if (!selectedCategory) return null;
    const categoryModules = modules.filter((m) => normalizeCategory(m.category) === normalizeCategory(selectedCategory));
    const withIntroMarkers = categoryModules.filter((m) => {
      const seg = String(moduleDyn(m).moduleSegment ?? '').trim().toLowerCase();
      const title = String(m.moduleTitle ?? '').trim().toLowerCase();
      const hasTechniqueVideo = String(moduleDyn(m).techniqueVideoUrl ?? '').trim().length > 0;
      const isIntro = seg === 'introduction' || title === 'intro' || title.includes('introduction');
      return hasTechniqueVideo && isIntro;
    });
    if (withIntroMarkers.length === 0) return null;
    return [...withIntroMarkers].sort((a, b) => {
      const sa = (a as any).sortOrder;
      const sb = (b as any).sortOrder;
      const aNum = typeof sa === 'number' ? sa : Number.MAX_SAFE_INTEGER;
      const bNum = typeof sb === 'number' ? sb : Number.MAX_SAFE_INTEGER;
      if (aNum !== bNum) return aNum - bNum;
      return String(a.moduleTitle ?? '').localeCompare(String(b.moduleTitle ?? ''));
    })[0];
  }, [modules, selectedCategory]);

  const getCategoryIntroductionVideoUrl = React.useCallback((categoryName: string | null | undefined): string | null => {
    const catNorm = normalizeCategory(categoryName ?? '');
    for (const m of modules) {
      if (normalizeCategory(m.category) !== catNorm) continue;
      const seg = String(moduleDyn(m).moduleSegment ?? '').trim().toLowerCase();
      const title = String(m.moduleTitle ?? '').trim().toLowerCase();
      const isIntro = seg === 'introduction' || title === 'intro' || title.includes('introduction');
      if (!isIntro) continue;
      const introUrl = getModuleIntroductionVideoUrl(m);
      if (introUrl) return introUrl;
    }
    return null;
  }, [modules]);
  const modulesInCategoryByLevel = groupByDifficulty(
    techniqueModulesInCategory,
    selectedCategory,
    introductionModuleForCategory ? [introductionModuleForCategory] : []
  );
  const hasCategoryProgramContent =
    techniqueModulesInCategory.length > 0 ||
    assignedWarmupModules.length > 0 ||
    assignedCooldownModules.length > 0 ||
    introductionModuleForCategory != null;

  const heroScale = useRef(new Animated.Value(0.92)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const listTranslateY = useRef(new Animated.Value(24)).current;
  const listOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!selectedCategory) return;
    overlayOpacity.setValue(1);
    heroScale.setValue(0.92);
    heroOpacity.setValue(0);
    listTranslateY.setValue(24);
    listOpacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(heroScale, { toValue: 1, useNativeDriver: true, tension: 70, friction: 12 }),
      ]),
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(listOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(listTranslateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      ]),
    ]).start();
  }, [selectedCategory, heroScale, heroOpacity, listTranslateY, listOpacity]);

  const handleBackFromCategory = () => {
    const OVERLAY_FADE_MS = 130;
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: OVERLAY_FADE_MS,
      useNativeDriver: true,
    }).start(() => setSelectedCategory(null));
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(heroScale, { toValue: 0.92, duration: 120, useNativeDriver: true }),
      Animated.timing(listOpacity, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(listTranslateY, { toValue: 16, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  // Android hardware back: close modals / category overlay before bubbling up
  // to the App-level handler (which would otherwise treat this as "exit app").
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = (): boolean => {
      if (weeklyRewardModalVisible) { return true; }
      if (purchaseModalVisible) { setPurchaseModalVisible(false); setPurchaseTargetModule(null); return true; }
      if (recModalVisible) { setRecModalVisible(false); return true; }
      if (dayHistoryModalVisible) { setDayHistoryModalVisible(false); return true; }
      if (selectedCategory) { handleBackFromCategory(); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [weeklyRewardModalVisible, purchaseModalVisible, recModalVisible, dayHistoryModalVisible, selectedCategory]);

  const renderModuleCard = (mod: ModuleItem | Module, onPress: () => void, locked = false): React.ReactNode => {
    const durationMin = mod.videoDuration ? `${Math.ceil(mod.videoDuration / 60)} min` : '';
    return (
      <TouchableOpacity
        key={mod.moduleId}
        style={[styles.moduleCard, locked && styles.lockedModuleCard]}
        activeOpacity={0.8}
        onPress={onPress}
      >
        <View style={styles.moduleHeader}>
          <Text style={styles.moduleCategory} numberOfLines={1}>{mod.category ?? 'Other'}</Text>
        </View>
        <View style={styles.moduleBody}>
          {mod.thumbnailUrl ? (
            <Image source={{ uri: mod.thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnailPlaceholder}><Text style={styles.thumbnailIcon}>🥋</Text></View>
          )}
          <Text style={styles.moduleTitle} numberOfLines={2}>{mod.moduleTitle}</Text>
          {mod.description ? <Text style={styles.moduleDesc} numberOfLines={2}>{mod.description}</Text> : null}
          {durationMin ? <Text style={styles.duration}>{durationMin}</Text> : null}
        </View>
        {locked ? (
          <View style={styles.lockedOverlay}>
            <Text style={styles.lockedOverlayTitle}>Locked Module</Text>
            <Text style={styles.lockedOverlaySubtitle}>Purchase module to unlock</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderModuleCardRow = (mod: ModuleItem | Module, onPress: () => void): React.ReactNode => {
    const durationMin = mod.videoDuration ? `${Math.ceil(mod.videoDuration / 60)} min` : '';
    return (
      <TouchableOpacity key={mod.moduleId} style={styles.moduleRowCard} activeOpacity={0.8} onPress={onPress}>
        <View style={styles.moduleRowCardBody}>
          {mod.thumbnailUrl ? (
            <Image source={{ uri: mod.thumbnailUrl }} style={styles.moduleRowThumbnail} />
          ) : (
            <View style={styles.moduleRowThumbnailPlaceholder}><Text style={styles.moduleRowThumbnailIcon}>🥋</Text></View>
          )}
          <Text style={styles.moduleRowTitle} numberOfLines={2}>{mod.moduleTitle}</Text>
          {mod.description ? <Text style={styles.moduleRowDesc} numberOfLines={1}>{mod.description}</Text> : null}
          {durationMin ? <Text style={styles.moduleRowDuration}>{durationMin}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderModuleListCard = (
    mod: ModuleItem | Module,
    onPress: () => void,
    sectionLabel?: string,
    locked = false,
    selected = false,
    showGuidePreview = false
  ): React.ReactNode => {
    const durationMin = mod.videoDuration ? `${Math.ceil(mod.videoDuration / 60)} min` : '';
    const previewSource = showGuidePreview && mod.referenceGuideUrl ? { uri: mod.referenceGuideUrl } : null;
    return (
      <TouchableOpacity
        key={mod.moduleId}
        style={[
          styles.moduleListCard,
          locked && styles.lockedModuleCard,
          selected && styles.moduleListCardSelected,
        ]}
        activeOpacity={0.88}
        onPress={onPress}
      >
        <View style={styles.moduleListLeft}>
          {sectionLabel ? (
            <View style={styles.moduleListPill}>
              <Text style={styles.moduleListPillText} numberOfLines={1}>{sectionLabel}</Text>
            </View>
          ) : null}
          <Text style={styles.moduleListTitle} numberOfLines={2}>{mod.moduleTitle}</Text>
          <Text style={styles.moduleListDesc} numberOfLines={1}>
            {selected ? 'Double-tap to start here' : 'Tap to select · Double-tap to start'}
          </Text>
          {durationMin ? <Text style={styles.moduleListMeta}>{durationMin}</Text> : null}
        </View>
        <View style={styles.moduleListRight}>
          {previewSource ? (
            <Image source={previewSource} style={styles.moduleListImage} />
          ) : mod.thumbnailUrl ? (
            <Image source={{ uri: mod.thumbnailUrl }} style={styles.moduleListImage} />
          ) : (
            <View style={styles.moduleListImagePlaceholder}><Text style={styles.moduleListImageIcon}>🥋</Text></View>
          )}
        </View>
        {locked ? (
          <View style={styles.lockedOverlayList}>
            <Text style={styles.lockedOverlayTitle}>Locked Module</Text>
            <Text style={styles.lockedOverlaySubtitle}>Purchase module to unlock</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  /**
   * Start a category session using the currently selected warmup/cooldown/introduction
   * selections. When `overrideTrainingIdx` is provided (e.g. from double-tapping a
   * training card), skip warmups/introduction/cooldown selections and jump straight
   * into training from that index.
   */
  const triggerStartSession = (overrideTrainingIdx?: number) => {
    const trainingSection = modulesInCategoryByLevel.find((x) => x.label === 'Training');
    const trainingModules = trainingSection?.items ?? [];
    const isOverride = typeof overrideTrainingIdx === 'number';

    const hasIntroductionStartSelection = !isOverride && introductionStartCardIndex >= 0;
    const hasCooldownStartSelection = !isOverride && cooldownStartCardIndex >= 0 && warmupStartCardIndex < 0;
    const hasTrainingStartSelection = isOverride ? true : trainingStartCardIndex >= 0;

    if (!trainingModules.length && !hasCooldownStartSelection && !hasIntroductionStartSelection && !isOverride) {
      showToast('No training modules found for this category.');
      return;
    }

    const warmupStartIdx = warmupStartCardIndex >= 0 ? warmupStartCardIndex : 0;
    const cooldownStartIdx = cooldownStartCardIndex >= 0 ? cooldownStartCardIndex : 0;
    const trainingStartIdx = isOverride
      ? (overrideTrainingIdx as number)
      : (trainingStartCardIndex >= 0 ? trainingStartCardIndex : 0);
    const allWarmups = warmupTop3Values.filter((v) => v !== '—');
    const allCooldowns = cooldownTop3Values.filter((c) => c && c !== '—');
    const trainingSlice = trainingModules.slice(trainingStartIdx);
    const useFullTrainingList = hasTrainingStartSelection;
    const trainingModulesForSession = useFullTrainingList ? trainingModules : trainingSlice;
    const initialTrainingIndex = useFullTrainingList ? trainingStartIdx : 0;
    const firstTrainingGuideUri =
      trainingModulesForSession[initialTrainingIndex]
        ? extractRemoteUrl(moduleDyn(trainingModulesForSession[initialTrainingIndex]!).referenceGuideUrl)
        : null;

    onStartCategorySession({
      category: selectedCategory ?? 'Punching',
      warmups: (hasIntroductionStartSelection || hasCooldownStartSelection)
        ? []
        : allWarmups,
      cooldowns: allCooldowns,
      trainingModules: trainingModulesForSession,
      introductionVideoUrl: introductionModuleForCategory
        ? getModuleIntroductionVideoUrl(introductionModuleForCategory)
        : null,
      startPhase: hasIntroductionStartSelection
        ? 'introduction'
        : (hasCooldownStartSelection ? 'cooldown' : (hasTrainingStartSelection ? 'training' : 'warmup')),
      mannequinGifUri: firstTrainingGuideUri,
      initialWarmupIndex: (!hasIntroductionStartSelection && !hasCooldownStartSelection && !hasTrainingStartSelection)
        ? warmupStartIdx
        : 0,
      initialCooldownIndex: hasCooldownStartSelection ? cooldownStartIdx : 0,
      initialTrainingIndex,
    });
  };

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        removeClippedSubviews
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#07bbc0"
            colors={['#07bbc0']}
          />
        }
      >
        {recommendedModules.length > 0 && (
          <View style={styles.recommendationsSection}>
            <Text style={styles.recommendationsTitle}>Recommended for you</Text>
            <Text style={styles.recommendationsSubtext}>Best suited to your profile.</Text>
            <View style={styles.moduleGrid}>
              {recommendedModules.slice(0, 4).map((mod: Module) => {
                const locked = isModuleLocked(mod.moduleId);
                return renderModuleCard(
                  mod,
                  () => {
                    if (locked) {
                      setPurchaseTargetModule(mod as ModuleItem);
                      setPurchaseModalVisible(true);
                      return;
                    }
                    onOpenModule(mod.moduleId, mod);
                  },
                  locked
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.weeklyGoalContainer}>
          <TouchableOpacity
            onPress={() => setRecModalVisible(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open recommended training modules"
          >
            <Image source={require('../assets/images/defendudashboardlogo.png')} style={styles.weeklyGoalLogo} resizeMode="contain" />
          </TouchableOpacity>
          <View style={styles.weeklyGoalHeader}>
            <View>
              <Text style={styles.weeklyGoalTitle}>Weekly Goal</Text>
            </View>
            <View style={styles.weeklyGoalStats}>
              <Text style={styles.weeklyGoalPercentage}>{Math.round(weeklyProgress * 100)}%</Text>
            </View>
          </View>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${weeklyProgress * 100}%` }]} />
          </View>
          <View style={styles.weekDaysRow}>
            {DAYS.map((day, i) => (
              <TouchableOpacity
                key={day}
                onPress={() => handleWeekdayPress(i)}
                style={[styles.dayProgressTouch, i === selectedDay && styles.dayProgressTouchSelected]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${day}${i === todayIndex ? ', today' : ''}`}
                accessibilityHint="Double tap to see training modules you completed on this day this week"
              >
                <View style={styles.dayProgressBarBg}>
                  <View style={[styles.dayProgressBarFill, { width: `${(dayProgress[i] ?? 0) * 100}%` }]} />
                </View>
                <View style={styles.dayProgressContent}>
                  <Text style={[styles.dayLabel, i === selectedDay && styles.dayLabelActive]}>{day}</Text>
                  {i === todayIndex && <Text style={styles.todayBadge}>Today</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.weekHistoryHint}>
            Double-tap a day for this week&apos;s completed training.
          </Text>
          {weeklyProgress >= 1 ? (
            <Text style={styles.weeklyGoalCongratsText}>
              Congratulations on your weekly goal! Come back next week to earn credits!
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TRAINING MODULES</Text>
          <Text style={styles.sectionSubtitle}>
            {selectedCategory ? `Tap a module to start.` : 'Choose a category, then pick a module.'}
          </Text>
        </View>
        {loading ? (
          <View style={[styles.loadingBox, { paddingVertical: 32, minHeight: 120 }]}>
            <ActivityIndicator size="small" color="#07bbc0" />
            <Text style={styles.loadingText}>Loading modules...</Text>
          </View>
        ) : modules.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No modules available yet</Text>
            <Text style={styles.emptySubtitle}>Check back later for new training content.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.swipeHint}>Swipe to explore categories</Text>
            {categoryLoadError ? <Text style={styles.categoryErrorText}>{categoryLoadError}</Text> : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScrollContent}
              snapToInterval={HORIZONTAL_SNAP_INTERVAL}
              snapToAlignment="start"
              decelerationRate="fast"
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {moduleCategories.map((categoryRow, index) => {
                const cat = categoryRow.name;
                const count = modules.filter(
                  (m) =>
                    normalizeCategory(m.category) === normalizeCategory(cat) &&
                    !String(moduleDyn(m).moduleSegment ?? '').trim()
                ).length;
                return (
                  <TrainingCategoryCard
                    key={categoryRow.key}
                    category={cat}
                    thumbnailUrl={categoryRow.thumbnailUrl}
                    moduleCount={count}
                    index={index}
                    cardWidth={HORIZONTAL_CARD_WIDTH}
                    onPress={() => setSelectedCategory(cat)}
                  />
                );
              })}
            </ScrollView>
          </>
        )}
      </ScrollView>

      {selectedCategory ? (
        <View style={styles.categoryOverlay} pointerEvents="box-none">
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
          <ScrollView
            style={styles.categoryOverlayScroll}
            contentContainerStyle={styles.categoryOverlayContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            removeClippedSubviews
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#07bbc0"
                colors={['#07bbc0']}
              />
            }
          >
            {/* Performance: avoid rendering offscreen content while scrolling. */}
            <Animated.View
              style={[
                styles.expandedCategoryHeroOverlay,
                {
                  opacity: heroOpacity,
                  transform: [{ scale: heroScale }],
                },
              ]}
            >
              <View style={styles.expandedCategoryHeroImageWrap}>
                {selectedCategoryHeroImageSource != null ? (
                  <Image
                    source={selectedCategoryHeroImageSource}
                    style={styles.expandedCategoryHeroImage}
                    resizeMode="cover"
                    onError={() => {
                      if (selectedCategoryRemoteImageSource) setExpandedRemoteImageError(true);
                      else setExpandedBundledImageError(true);
                    }}
                  />
                ) : (
                  <View style={styles.expandedCategoryHeroPlaceholder}>
                    <Text style={styles.categoryCardPlaceholderIcon}>🥋</Text>
                  </View>
                )}
                <View style={styles.expandedCategoryHeroGradient} />
                <Text style={styles.expandedCategoryHeroTitle}>{selectedCategory}</Text>
                <TouchableOpacity
                  style={styles.expandedCategoryHeroBackBtn}
                  onPress={handleBackFromCategory}
                  activeOpacity={0.8}
                >
                  <Image source={require('../assets/images/icon-back.png')} style={styles.expandedCategoryHeroBackIcon} resizeMode="contain" />
                </TouchableOpacity>
              </View>
            </Animated.View>

            <Animated.View
              style={[
                styles.expandedCategoryListWrap,
                {
                  opacity: listOpacity,
                  transform: [{ translateY: listTranslateY }],
                },
              ]}
            >
              {!hasCategoryProgramContent ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>
                    No modules in this category yet
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    Check back later for new content.
                  </Text>
                </View>
              ) : (
                <>
                  {modulesInCategoryByLevel.map(({ label, items }) => (
                    <View key={label} style={styles.difficultySection}>
                      <Text style={styles.difficultySectionTitle}>{label}</Text>
                      {label === 'Introduction' && (
                        <View style={styles.placeholdersColumn}>
                          {items.length > 0 ? (
                            (() => {
                              const mod = items[0];
                              return (
                                <TouchableOpacity
                                  key={`intro-${mod.moduleId}`}
                                  style={[
                                    styles.placeholderCard,
                                    introductionStartCardIndex === 0
                                      ? { backgroundColor: 'rgba(7, 187, 192, 0.15)', borderColor: '#07bbc0' }
                                      : { backgroundColor: '#011f36', borderColor: '#062731' },
                                  ]}
                                  activeOpacity={0.9}
                                  onPress={() => {
                                    // Match warmup/cooldown/training UX: choose where Start begins.
                                    setWarmupStartCardIndex(-1);
                                    setCooldownStartCardIndex(-1);
                                    setTrainingStartCardIndex(-1);
                                    setIntroductionStartCardIndex(0);
                                  }}
                                >
                                  <View style={styles.placeholderTextWrap}>
                                    <View style={styles.moduleListPill}>
                                      <Text style={styles.moduleListPillText} numberOfLines={1}>Introduction</Text>
                                    </View>
                                    <Text style={styles.placeholderTitle} numberOfLines={2}>{mod.moduleTitle ?? 'Category Introduction'}</Text>
                                    <Text style={styles.placeholderSubtitle}>
                                      {introductionStartCardIndex === 0 ? 'Start here' : 'Tap to start here'}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })()
                          ) : (
                            <View style={[styles.placeholderCard, { opacity: 0.5 }]}>
                              <View style={styles.placeholderTextWrap}>
                                <View style={styles.moduleListPill}>
                                  <Text style={styles.moduleListPillText} numberOfLines={1}>Introduction</Text>
                                </View>
                                <Text style={styles.placeholderTitle} numberOfLines={2}>No introduction video</Text>
                                <Text style={styles.placeholderSubtitle}>Add an Introduction module to enable this step</Text>
                              </View>
                            </View>
                          )}
                        </View>
                      )}
                      {(label === 'Warmup' || label === 'Cooldown') && (
                        <View style={styles.placeholdersColumn}>
                          {(label === 'Warmup' ? warmupTop3Values : cooldownTop3Values).map((t, idx) => {
                            const isWarmup = label === 'Warmup';
                            const isDisabled = t === '—';
                            const isSelected = isWarmup ? idx === warmupStartCardIndex : idx === cooldownStartCardIndex;
                            const isSelectable = !isDisabled;
                            const cardStyle = [
                              styles.placeholderCard,
                              isWarmup
                                ? {
                                    backgroundColor: isDisabled
                                      ? '#011f36'
                                      : isSelected
                                        ? 'rgba(7, 187, 192, 0.15)'
                                        : '#011f36',
                                    borderColor: isDisabled
                                      ? '#062731'
                                      : isSelected
                                        ? '#07bbc0'
                                        : '#062731',
                                    opacity: isDisabled ? 0.5 : 1,
                                  }
                                : undefined,
                            ];

                            if (!isWarmup) {
                              // Cooldown card: tappable start card (same UX as warmups).
                              const cooldownCardStyle = [
                                styles.placeholderCard,
                                isDisabled
                                  ? { backgroundColor: '#011f36', borderColor: '#062731', opacity: 0.5 }
                                  : isSelected
                                    ? { backgroundColor: 'rgba(7, 187, 192, 0.15)', borderColor: '#07bbc0', opacity: 1 }
                                    : { backgroundColor: '#011f36', borderColor: '#062731', opacity: 1 },
                              ];
                              const cooldownGuide =
                                getCooldownGuideSource(t) ||
                                resolveThumbnailWithVariants(cooldownModuleGuideByTitle, t);
                              const cooldownGuideSrc = toImageSource(cooldownGuide);
                              const cooldownThumb =
                                resolveThumbnailWithVariants(cooldownThumbnailByExercise, t) ||
                                resolveThumbnailWithVariants(cooldownModuleThumbByTitle, t);

                              return (
                                <TouchableOpacity
                                  key={`${label}-${idx}`}
                                  style={cooldownCardStyle}
                                  activeOpacity={0.9}
                                  disabled={isDisabled}
                                  onPress={() => {
                                    if (!isSelectable) return;
                                    const now = Date.now();
                                    const last = lastCooldownTapRef.current;
                                    const isDoubleTap = last.index === idx && now - last.at < START_HERE_DOUBLE_TAP_MS;
                                    // Only one phase can be selected at a time.
                                    setIntroductionStartCardIndex(-1);
                                    setWarmupStartCardIndex(-1);
                                    setTrainingStartCardIndex(-1);
                                    setCooldownStartCardIndex(idx);
                                    if (isDoubleTap) {
                                      lastCooldownTapRef.current = { index: -1, at: 0 };
                                      triggerStartSession();
                                    } else {
                                      lastCooldownTapRef.current = { index: idx, at: now };
                                    }
                                  }}
                                >
                                  <View style={styles.placeholderTextWrap}>
                                    <View style={styles.moduleListPill}>
                                      <Text style={styles.moduleListPillText} numberOfLines={1}>{label}</Text>
                                    </View>
                                    <Text style={styles.placeholderTitle} numberOfLines={2}>{t}</Text>
                                    <Text style={styles.placeholderSubtitle}>
                                      {isSelected ? 'Start here (double-tap to start)' : 'Tap to start here'}
                                    </Text>
                                  </View>
                                  <View style={styles.placeholderThumbWrap}>
                                    {cooldownGuideSrc && !isDisabled && isSelected ? (
                                      <Image source={cooldownGuideSrc} style={styles.placeholderGuideImage} resizeMode="cover" />
                                    ) : cooldownThumb && !isDisabled ? (
                                      <Image source={{ uri: cooldownThumb }} style={styles.placeholderGuideImage} resizeMode="cover" />
                                    ) : (
                                      <Text style={styles.placeholderIcon}>{isSelected ? '▶' : '🥋'}</Text>
                                    )}
                                  </View>
                                </TouchableOpacity>
                              );
                            }

                            const warmupGuide =
                              getWarmupGuideSource(t) ||
                              resolveThumbnailWithVariants(warmupModuleGuideByTitle, t);
                            const warmupGuideSrc = toImageSource(warmupGuide);
                            const warmupThumb =
                              resolveThumbnailWithVariants(warmupThumbnailByExercise, t) ||
                              resolveThumbnailWithVariants(warmupModuleThumbByTitle, t);
                            return (
                              <TouchableOpacity
                                key={`${label}-${idx}`}
                                style={cardStyle}
                                activeOpacity={0.9}
                                disabled={isDisabled}
                                onPress={() => {
                                  if (!isSelectable) return;
                                  const now = Date.now();
                                  const last = lastWarmupTapRef.current;
                                  const isDoubleTap = last.index === idx && now - last.at < START_HERE_DOUBLE_TAP_MS;
                                  // Tap warmup card to start session from that warmup.
                                  // Only one phase can be selected at a time.
                                  setIntroductionStartCardIndex(-1);
                                  setTrainingStartCardIndex(-1);
                                  setCooldownStartCardIndex(-1);
                                  setWarmupStartCardIndex(idx);
                                  if (isDoubleTap) {
                                    lastWarmupTapRef.current = { index: -1, at: 0 };
                                    triggerStartSession();
                                  } else {
                                    lastWarmupTapRef.current = { index: idx, at: now };
                                  }
                                }}
                              >
                                <View style={styles.placeholderTextWrap}>
                                  <View style={styles.moduleListPill}>
                                    <Text style={styles.moduleListPillText} numberOfLines={1}>{label}</Text>
                                  </View>
                                  <Text style={styles.placeholderTitle} numberOfLines={2}>{t}</Text>
                                  <Text style={styles.placeholderSubtitle}>
                                    {isSelected ? 'Start here (double-tap to start)' : 'Tap to start here'}
                                  </Text>
                                </View>
                                <View style={styles.placeholderThumbWrap}>
                                  {warmupGuideSrc && !isDisabled && isSelected ? (
                                    <Image source={warmupGuideSrc} style={styles.placeholderGuideImage} resizeMode="cover" />
                                  ) : warmupThumb && !isDisabled ? (
                                    <Image source={{ uri: warmupThumb }} style={styles.placeholderGuideImage} resizeMode="cover" />
                                  ) : (
                                    <Text style={styles.placeholderIcon}>{isSelected ? '▶' : '🥋'}</Text>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      {label !== 'Introduction' && (
                        <View style={styles.moduleListColumn}>
                          {items.length > 0 &&
                            items.map((mod: ModuleItem, modIdx: number) =>
                              renderModuleListCard(mod, () => {
                                const locked = label === 'Training' ? isModuleLocked(mod.moduleId) : false;
                                if (locked) {
                                  setPurchaseTargetModule(mod);
                                  setPurchaseModalVisible(true);
                                  return;
                                }
                                if (label === 'Training') {
                                  // Double-tap (within 350ms on the same card) starts the
                                  // session immediately from this training module.
                                  const now = Date.now();
                                  const last = lastTrainingTapRef.current;
                                  const isDoubleTap = last.id === mod.moduleId && now - last.at < 350;

                                  // Tap (single or first of double) selects the card visually.
                                  setIntroductionStartCardIndex(-1);
                                  setWarmupStartCardIndex(-1);
                                  setCooldownStartCardIndex(-1);
                                  setTrainingStartCardIndex(modIdx);

                                  if (isDoubleTap) {
                                    lastTrainingTapRef.current = { id: '', at: 0 };
                                    triggerStartSession(modIdx);
                                  } else {
                                    lastTrainingTapRef.current = { id: mod.moduleId, at: now };
                                  }
                                  return;
                                }

                                onOpenModule(mod.moduleId, mod);
                              }, label, label === 'Training' ? isModuleLocked(mod.moduleId) : false, label === 'Training' && modIdx === trainingStartCardIndex, label === 'Training' && modIdx === trainingStartCardIndex)
                            )}
                        </View>
                      )}
                    </View>
                  ))}
                </>
              )}
            </Animated.View>
          </ScrollView>
          </Animated.View>
          {hasCategoryProgramContent && (
            <TouchableOpacity
              style={styles.categoryFloatingStartButton}
              onPress={() => triggerStartSession()}
              activeOpacity={0.9}
            >
              <Text style={styles.categoryFloatingStartButtonText}>Start</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <Modal
        visible={weeklyRewardModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.recModalBackdrop}>
          <View style={styles.weeklyRewardCard}>
            <Text style={styles.weeklyRewardEyebrow}>WEEKLY GOAL ACHIEVED</Text>
            <Text style={styles.weeklyRewardTitle}>Congratulations!</Text>
            <Text style={styles.weeklyRewardSub}>
              You completed your weekly goal. You earned{' '}
              {weeklyReward?.credits ?? (targetModulesPerWeek + targetModulesPerDay)} credits.
            </Text>
            <Pressable
              style={[styles.weeklyRewardClaimButton, claimingWeeklyReward ? styles.modalDisabled : null]}
              onPress={handleClaimWeeklyReward}
              disabled={claimingWeeklyReward}
            >
              <Text style={styles.weeklyRewardClaimButtonText}>
                {claimingWeeklyReward ? 'CLAIMING...' : 'CLAIM'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={recModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecModalVisible(false)}
      >
        <View style={styles.recModalBackdrop}>
          <View style={styles.recModalCard}>
            <Text style={styles.recModalTitle}>Recommended Training Modules</Text>
            <Text style={styles.recModalSub}>
              Five picks tailored to your skill profile
              {skillProfile ? '' : ' (complete your profile for stronger matches)'}
              , similar learners when available, and your training results
              {completedModuleIds.length >= PERFORMANCE_PHASE_COMPLETION_THRESHOLD
                ? ' — struggles weigh more after you have completed several modules.'
                : '.'}
            </Text>
            {personalizedRecModules.length === 0 ? (
              <Text style={styles.recModalEmpty}>
                {modules.length === 0
                  ? 'No modules loaded yet.'
                  : completedModuleIds.length >= modules.length
                    ? 'You have completed every available module. Outstanding work.'
                    : 'No matches right now. Pull to refresh or check back soon.'}
              </Text>
            ) : (
              <ScrollView
                style={styles.recModalList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {personalizedRecModules.map((mod, idx) => {
                  const locked = isModuleLocked(mod.moduleId);
                  const fails = moduleTrainingStats[mod.moduleId]?.failCount ?? 0;
                  const hint =
                    fails > 0
                      ? `Needs practice — ${fails} incomplete training session${fails === 1 ? '' : 's'}`
                      : 'Aligned with your level and goals';
                  return (
                    <TouchableOpacity
                      key={mod.moduleId}
                      style={[styles.recModalRow, locked && styles.lockedRecModalRow]}
                      activeOpacity={0.88}
                      onPress={() => {
                        if (locked) {
                          setPurchaseTargetModule(mod);
                          setPurchaseModalVisible(true);
                          return;
                        }
                        openRecommendedReason(mod);
                      }}
                    >
                      <View style={styles.recModalRank}>
                        <Text style={styles.recModalRankText}>{idx + 1}</Text>
                      </View>
                      <View style={styles.recModalRowBody}>
                        <Text style={styles.recModalModuleTitle} numberOfLines={2}>
                          {mod.moduleTitle ?? mod.moduleId}
                        </Text>
                        <Text style={styles.recModalModuleMeta} numberOfLines={1}>
                          {mod.category ?? 'Training'} · {hint}
                        </Text>
                      </View>
                      <Text style={styles.recModalChevron}>›</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <Pressable style={styles.recModalClose} onPress={() => setRecModalVisible(false)}>
              <Text style={styles.recModalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={recDetailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecDetailModalVisible(false)}
      >
        <View style={styles.recModalBackdrop}>
          <View style={styles.recModalCard}>
            <Text style={styles.recModalTitle}>Why this is recommended</Text>
            <Text style={styles.recModalSub}>
              Review these recommendation factors before continuing to the introduction.
            </Text>
            {recDetailModule ? (
              <>
                <View style={styles.recWhyModuleHeader}>
                  <Text style={styles.recWhyModuleTitle} numberOfLines={2}>
                    {recDetailModule.moduleTitle ?? recDetailModule.moduleId}
                  </Text>
                  <Text style={styles.recWhyModuleMeta} numberOfLines={1}>
                    {recDetailModule.category ?? 'Training'}
                  </Text>
                </View>
                <ScrollView style={styles.recWhyReasonList} showsVerticalScrollIndicator={false}>
                  {recDetailReasons.map((reason) => (
                    <View key={reason} style={styles.recWhyReasonRow}>
                      <Text style={styles.recWhyBullet}>•</Text>
                      <Text style={styles.recWhyReasonText}>{reason}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : (
              <Text style={styles.recModalEmpty}>No recommendation selected.</Text>
            )}
            <View style={styles.recWhyActions}>
              <Pressable
                style={styles.recWhyBackButton}
                onPress={() => setRecDetailModalVisible(false)}
              >
                <Text style={styles.recWhyBackButtonText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.recWhyContinueButton, !recDetailModule ? styles.modalDisabled : null]}
                onPress={continueRecommendedFlow}
                disabled={!recDetailModule}
              >
                <Text style={styles.recWhyContinueButtonText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dayHistoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDayHistoryModalVisible(false)}
      >
        <View style={styles.recModalBackdrop}>
          <View style={styles.recModalCard}>
            <Text style={styles.recModalTitle}>{getWeekdayColumnDateLabel(dayHistoryDayIndex)}</Text>
            <Text style={styles.recModalSub}>
              {dayHistoryEntries.length === 0
                ? 'Module completions logged for this week on this weekday.'
                : `${dayHistoryEntries.length} module${dayHistoryEntries.length === 1 ? '' : 's'} completed this week — each listed once, newest at the top.`}
            </Text>
            {dayHistoryEntries.length === 0 ? (
              <Text style={styles.recModalEmpty}>
                Nothing for this weekday in the current week yet. Finish a module and it will match the bar above — then it appears here until the week ends.
              </Text>
            ) : (
              <ScrollView
                style={styles.recModalList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {dayHistoryEntries.map((entry) => {
                  const mod = modules.find((m) => m.moduleId === entry.moduleId) ?? null;
                  const title = mod?.moduleTitle ?? entry.moduleId;
                  const category = mod?.category ?? 'Training';
                  const locked = mod ? isModuleLocked(mod.moduleId) : false;
                  return (
                    <TouchableOpacity
                      key={entry.moduleId}
                      style={[styles.recModalRow, locked && styles.lockedRecModalRow, !mod && styles.historyModalRowDisabled]}
                      activeOpacity={mod ? 0.88 : 1}
                      disabled={!mod}
                      onPress={() => {
                        if (!mod) return;
                        if (locked) {
                          setPurchaseTargetModule(mod);
                          setPurchaseModalVisible(true);
                          return;
                        }
                        setDayHistoryModalVisible(false);
                        const cat = mod.category?.trim() ? mod.category.trim() : 'Punching';
                        onStartCategorySession({
                          category: cat,
                          warmups: [],
                          cooldowns: [],
                          trainingModules: [mod],
                          introductionVideoUrl: getCategoryIntroductionVideoUrl(cat),
                          mannequinGifUri: extractRemoteUrl(moduleDyn(mod).referenceGuideUrl),
                          returnToCategoryAfterExit: false,
                        });
                      }}
                    >
                      <View style={styles.historyModalDoneBadge}>
                        <Text style={styles.historyModalDoneMark}>✓</Text>
                      </View>
                      <View style={styles.recModalRowBody}>
                        <Text style={styles.recModalModuleTitle} numberOfLines={2}>
                          {title}
                        </Text>
                        <Text style={styles.recModalModuleMeta} numberOfLines={2}>
                          {category} · {formatCompletionTime(entry.completedAt)}
                        </Text>
                      </View>
                      {mod ? <Text style={styles.recModalChevron}>›</Text> : <View style={styles.recModalChevronSpacer} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <Pressable style={styles.recModalClose} onPress={() => setDayHistoryModalVisible(false)}>
              <Text style={styles.recModalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={purchaseModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPurchaseModalVisible(false)}
      >
        <View style={styles.paywallBackdrop}>
          <View style={styles.paywallCard}>
            <Text style={styles.paywallEyebrow}>LIMITED ACCESS</Text>
            <Text style={styles.paywallTitle}>Unlock Pro Training</Text>
            <Text style={styles.paywallSub}>
              You already unlocked the first module for free. Keep momentum going with full drills, progress loops, and complete category access.
            </Text>

            <View style={styles.paywallPriceBox}>
              <View style={styles.paywallBalanceRow}>
                <View style={styles.paywallBalanceLeft}>
                  <Text style={styles.paywallPriceLabel}>Your balance</Text>
                  <Text style={styles.paywallCreditsValue}>{userCredits} credits</Text>
                </View>
                <TouchableOpacity
                  style={styles.paywallTopUpPlusBtn}
                  onPress={() => {
                    setPurchaseModalVisible(false);
                    onOpenTopUp?.();
                  }}
                  activeOpacity={0.85}
                  disabled={!onOpenTopUp}
                >
                  <Text style={styles.paywallTopUpPlusText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.paywallPrimaryBtn, (purchasing || userCredits < 50) && styles.paywallBtnDisabled]}
              disabled={purchasing || userCredits < 50 || !purchaseTargetModule}
              onPress={async () => {
                if (!purchaseTargetModule) return;
                try {
                  setPurchasing(true);
                  const result = await purchaseModulesWithCredits({
                    purchaseType: 'single',
                    category: purchaseTargetModule.category ?? 'Other',
                    moduleIdsToPurchase: [purchaseTargetModule.moduleId],
                    amountCredits: 50,
                    moduleId: purchaseTargetModule.moduleId,
                    moduleTitle: purchaseTargetModule.moduleTitle,
                  });
                  setPurchasedModuleIds((prev) => Array.from(new Set([...prev, ...result.purchasedModuleIds])));
                  setUserCredits(result.newCredits);
                  setPurchaseModalVisible(false);
                  onModulePurchaseComplete?.({ invoice: result.invoice, newCredits: result.newCredits });
                } catch (e) {
                  showToast((e as Error).message || 'Could not complete purchase.');
                } finally {
                  setPurchasing(false);
                }
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.paywallPrimaryBtnText}>{purchasing ? 'Processing...' : 'Unlock This Module - 50 Credits'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.paywallSecondaryBtn,
                (purchasing ||
                  !purchaseTargetModule ||
                  userCredits < (purchaseTargetModule ? getCategoryBuyAllPrice(purchaseTargetModule.category ?? '') : 0) ||
                  (purchaseTargetModule ? getCategoryBuyAllPrice(purchaseTargetModule.category ?? '') <= 0 : true)) &&
                  styles.paywallBtnDisabled,
              ]}
              disabled={
                purchasing ||
                !purchaseTargetModule ||
                userCredits < (purchaseTargetModule ? getCategoryBuyAllPrice(purchaseTargetModule.category ?? '') : 0) ||
                (purchaseTargetModule ? getCategoryBuyAllPrice(purchaseTargetModule.category ?? '') <= 0 : true)
              }
              onPress={async () => {
                if (!purchaseTargetModule) return;
                const category = purchaseTargetModule.category ?? 'Other';
                const payable = getPayableModulesForCategory(category);
                const remaining = payable.filter((m) => !purchasedModuleIds.includes(m.moduleId));
                const price = remaining.length * 50;
                if (price <= 0) {
                  showToast('All modules in this category are already unlocked.');
                  return;
                }
                try {
                  setPurchasing(true);
                  const result = await purchaseModulesWithCredits({
                    purchaseType: 'category',
                    category,
                    moduleIdsToPurchase: remaining.map((m) => m.moduleId),
                    amountCredits: price,
                    moduleId: purchaseTargetModule.moduleId,
                    moduleTitle: purchaseTargetModule.moduleTitle,
                  });
                  setPurchasedModuleIds((prev) => Array.from(new Set([...prev, ...result.purchasedModuleIds])));
                  setUserCredits(result.newCredits);
                  setPurchaseModalVisible(false);
                  onModulePurchaseComplete?.({ invoice: result.invoice, newCredits: result.newCredits });
                } catch (e) {
                  showToast((e as Error).message || 'Could not complete purchase.');
                } finally {
                  setPurchasing(false);
                }
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.paywallSecondaryBtnText}>
                {purchasing
                  ? 'Processing...'
                  : `Unlock Entire Module - ${purchaseTargetModule ? getCategoryBuyAllPrice(purchaseTargetModule.category ?? '') : 0} Credits`}
              </Text>
            </TouchableOpacity>

            <Pressable
              style={styles.paywallClose}
              onPress={() => {
                if (purchasing) return;
                setPurchaseModalVisible(false);
              }}
            >
              <Text style={styles.paywallCloseText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!categoryReviewPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryReviewPrompt(null)}
      >
        <View style={styles.recModalBackdrop}>
          <View style={styles.recModalCard}>
            <Text style={styles.recModalTitle}>Rate This Category</Text>
            <Text style={styles.recModalSub}>
              Rate each trainer in {categoryReviewPrompt?.category}. Tap stars to leave your optional rating.
            </Text>
            {categoryReviewPrompt?.trainers?.length ? (
              <ScrollView style={styles.reviewTrainerListScroll} showsVerticalScrollIndicator={false}>
                {categoryReviewPrompt.trainers.map((t) => (
                  <View key={t.uid} style={styles.reviewTrainerRow}>
                    {trainerPhotoByUid[t.uid] ? (
                      <Image source={{ uri: trainerPhotoByUid[t.uid] }} style={styles.reviewTrainerAvatar} />
                    ) : (
                      <View style={styles.reviewTrainerAvatarPlaceholder}>
                        <Text style={styles.reviewTrainerAvatarLetter}>{(t.name?.trim()?.charAt(0) || 'T').toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={styles.reviewTrainerBody}>
                      <Text style={styles.reviewTrainerName}>{t.name}</Text>
                      <View style={styles.reviewStarRow}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <TouchableOpacity
                            key={`${t.uid}-${s}`}
                            onPress={() => {
                              setTrainerRatings((prev) => ({ ...prev, [t.uid]: s }));
                            }}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.reviewStarSmall,
                                s <= (trainerRatings[t.uid] ?? 0) && styles.reviewStarActive,
                              ]}
                            >
                              ★
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalNoButton} onPress={() => setCategoryReviewPrompt(null)}>
                <Text style={styles.modalNoText}>Not now</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalYesButton,
                  (submittingCategoryReview || !canSubmitCategoryTrainerRatings) && styles.modalDisabled,
                ]}
                disabled={submittingCategoryReview || !canSubmitCategoryTrainerRatings}
                onPress={async () => {
                  if (!categoryReviewPrompt) return;
                  try {
                    setSubmittingCategoryReview(true);
                    const nextRatings: Record<string, number> = {};
                    for (const t of categoryReviewPrompt.trainers) {
                      const v = trainerRatings[t.uid] ?? 0;
                      if (v >= 1 && v <= 5) nextRatings[t.uid] = v;
                    }
                    await AuthController.submitCategoryReview(
                      categoryReviewPrompt.category,
                      null,
                      undefined,
                      categoryReviewPrompt.trainers.map((t) => t.uid),
                      categoryReviewPrompt.trainers.map((t) => t.name),
                      nextRatings
                    );
                    setCategoryReviewPrompt(null);
                    showToast('Review submitted. Thank you!');
                  } catch (e) {
                    showToast((e as Error)?.message || 'Could not submit review.');
                  } finally {
                    setSubmittingCategoryReview(false);
                  }
                }}
              >
                <Text style={styles.modalYesText}>
                  {submittingCategoryReview ? 'Submitting...' : 'Submit'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  recommendationsSection: { marginBottom: 24 },
  recommendationsTitle: { fontSize: 18, fontWeight: '700', color: '#07bbc0', marginBottom: 4 },
  recommendationsSubtext: { fontSize: 13, color: '#6b8693', marginBottom: 12 },
  jabTesterCard: {
    backgroundColor: 'rgba(7, 187, 192, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#07bbc0',
  },
  jabTesterTitle: { fontSize: 17, fontWeight: '700', color: '#07bbc0', marginBottom: 4 },
  jabTesterSubtext: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  weeklyGoalContainer: { backgroundColor: '#011f36', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#062731' },
  weeklyGoalLogo: { width: '100%', maxWidth: 200, height: 44, alignSelf: 'center', marginBottom: 16 },
  recModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  recModalCard: {
    backgroundColor: '#011f36',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#062731',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    maxHeight: SCREEN_HEIGHT * 0.72,
  },
  weeklyRewardCard: {
    backgroundColor: '#011f36',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#07bbc0',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    maxHeight: SCREEN_HEIGHT * 0.72,
    shadowColor: '#07bbc0',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  weeklyRewardEyebrow: {
    color: '#9aeff2',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
  },
  weeklyRewardTitle: {
    color: '#07bbc0',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.4,
  },
  weeklyRewardSub: {
    color: '#d7e3e8',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 18,
  },
  weeklyRewardClaimButton: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#07bbc0',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#61f1f5',
  },
  weeklyRewardClaimButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  recModalTitle: { color: '#07bbc0', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  recModalSub: { color: '#6b8693', fontSize: 12, lineHeight: 17, marginBottom: 14 },
  recModalEmpty: { color: '#6b8693', fontSize: 14, paddingVertical: 16 },
  recModalList: { maxHeight: SCREEN_HEIGHT * 0.48 },
  recModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#041527',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#062731',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  lockedRecModalRow: {
    opacity: 0.62,
  },
  recModalRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(7, 187, 192, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  recModalRankText: { color: '#07bbc0', fontSize: 13, fontWeight: '800' },
  recModalRowBody: { flex: 1, minWidth: 0 },
  recModalModuleTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  recModalModuleMeta: { color: '#6b8693', fontSize: 12, marginTop: 4 },
  recModalChevron: { color: 'rgba(255,255,255,0.45)', fontSize: 22, marginLeft: 6 },
  recModalChevronSpacer: { width: 22, marginLeft: 6 },
  historyModalDoneBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  historyModalDoneMark: { color: '#4ade80', fontSize: 14, fontWeight: '800' },
  historyModalRowDisabled: { opacity: 0.55 },
  recModalClose: {
    marginTop: 6,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  recModalCloseText: { color: '#07bbc0', fontSize: 15, fontWeight: '700' },
  recWhyModuleHeader: {
    backgroundColor: '#041527',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  recWhyModuleTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  recWhyModuleMeta: { color: '#6b8693', fontSize: 12, marginTop: 4 },
  recWhyReasonList: { maxHeight: SCREEN_HEIGHT * 0.34, marginBottom: 14 },
  recWhyReasonRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  recWhyBullet: { color: '#07bbc0', fontSize: 16, lineHeight: 19, marginRight: 8, fontWeight: '700' },
  recWhyReasonText: { flex: 1, color: '#d7e3e8', fontSize: 13, lineHeight: 19 },
  recWhyActions: { flexDirection: 'row', gap: 10 },
  recWhyBackButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1a4657',
    backgroundColor: '#041527',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recWhyBackButtonText: { color: '#9eb4be', fontSize: 14, fontWeight: '700' },
  recWhyContinueButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#07bbc0',
    backgroundColor: '#07bbc0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recWhyContinueButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  reviewStarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  reviewStarSmall: { fontSize: 24, color: '#45616c' },
  reviewStarActive: { color: '#f0c14b' },
  reviewTrainerListScroll: { maxHeight: SCREEN_HEIGHT * 0.26, marginBottom: 10 },
  reviewTrainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#041527',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#062731',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  reviewTrainerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#07bbc0',
    marginRight: 10,
  },
  reviewTrainerAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#07bbc0',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a3645',
  },
  reviewTrainerAvatarLetter: { color: '#9aeff2', fontSize: 18, fontWeight: '800' },
  reviewTrainerBody: { flex: 1, minWidth: 0 },
  reviewTrainerName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  modalNoButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0a3645',
    backgroundColor: '#041527',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalNoText: { color: '#d7e3e8', fontSize: 14, fontWeight: '700' },
  modalYesButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#07bbc0',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalYesText: { color: '#041527', fontSize: 14, fontWeight: '900' },
  modalDisabled: { opacity: 0.5 },
  paywallBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  paywallCard: {
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
  paywallBalanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  paywallBalanceLeft: { flex: 1, minWidth: 0 },
  paywallPriceLabel: { color: '#6b8693', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  paywallCreditsValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginBottom: 8 },
  paywallTopUpPlusBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#07bbc0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallTopUpPlusText: { color: '#041527', fontSize: 22, fontWeight: '900', marginTop: -1 },
  paywallPriceLine: { color: '#FFFFFF', fontSize: 13, marginBottom: 6 },
  paywallPrimaryBtn: {
    backgroundColor: '#07bbc0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 11,
  },
  paywallPrimaryBtnText: { color: '#041527', fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },
  paywallSecondaryBtn: {
    backgroundColor: '#041527',
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 9,
  },
  paywallSecondaryBtnText: { color: '#07bbc0', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  paywallBtnDisabled: { opacity: 0.5 },
  paywallClose: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, marginTop: 2 },
  paywallCloseText: { color: '#6b8693', fontSize: 13, fontWeight: '700' },
  weeklyGoalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  weeklyGoalTitle: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  weeklyGoalStats: { alignItems: 'flex-end' },
  weeklyGoalPercentage: { fontSize: 24, fontWeight: '700', color: '#07bbc0' },
  progressBarBackground: { height: 8, backgroundColor: '#0a3645', borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
  progressBarFill: { height: 8, backgroundColor: '#07bbc0', borderRadius: 8 },
  weekDaysRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  weekHistoryHint: {
    marginTop: 10,
    fontSize: 11,
    color: 'rgba(107, 134, 147, 0.9)',
    textAlign: 'center',
    lineHeight: 15,
  },
  weeklyGoalCongratsText: {
    marginTop: 10,
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
  dayProgressTouch: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: '#062731',
    minWidth: 0,
  },
  dayProgressTouchSelected: { backgroundColor: 'rgba(7, 187, 192, 0.2)', borderWidth: 1, borderColor: '#07bbc0' },
  dayProgressBarBg: { height: 3, backgroundColor: '#0a3645', borderRadius: 2, alignSelf: 'stretch', marginBottom: 4, overflow: 'hidden' },
  dayProgressBarFill: { height: 3, backgroundColor: '#07bbc0', borderRadius: 2 },
  dayProgressContent: { alignItems: 'center' },
  dayLabel: { color: '#6b8693', fontSize: 11, fontWeight: '500' },
  dayLabelActive: { color: '#07bbc0', fontWeight: '700' },
  todayBadge: { color: '#07bbc0', fontSize: 9, fontWeight: '700', marginTop: 1 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#07bbc0', letterSpacing: 2, marginBottom: 4 },
  sectionSubtitle: { fontSize: 14, color: '#6b8693' },
  categoryOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#041527',
    zIndex: 50,
  },
  categoryOverlayScroll: { flex: 1 },
  categoryOverlayContent: { paddingHorizontal: 24, paddingBottom: 88 },
  expandedCategoryHeroOverlay: { marginBottom: 12 },
  expandedCategoryHero: { marginBottom: 12 },
  expandedCategoryHeroImageWrap: {
    width: EXPANDED_HERO_MAX_WIDTH,
    maxWidth: SCREEN_WIDTH - 48,
    height: EXPANDED_HERO_HEIGHT,
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
  },
  expandedCategoryHeroImage: { width: '100%', height: '100%' },
  expandedCategoryHeroPlaceholder: { width: '100%', height: '100%', backgroundColor: '#0a3645', justifyContent: 'center', alignItems: 'center' },
  expandedCategoryHeroGradient: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 80,
    backgroundColor: 'rgba(4, 21, 39, 0.88)',
  },
  expandedCategoryHeroTitle: {
    position: 'absolute', left: 16, right: 16, bottom: 16,
    color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  expandedCategoryHeroBackBtn: {
    position: 'absolute',
    top: SAFE_TOP,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(4, 21, 39, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedCategoryHeroBackIcon: { width: 24, height: 24, tintColor: '#FFF' },
  categoryFloatingStartButton: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 36,
    backgroundColor: '#07bbc0',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  categoryFloatingStartButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  expandedCategoryListWrap: { marginBottom: 24 },
  difficultySection: { marginBottom: 20 },
  difficultySectionTitle: { fontSize: 18, fontWeight: '700', color: '#07bbc0', marginBottom: 10, letterSpacing: 0.5 },
  placeholdersColumn: { gap: 8, marginBottom: 12 },
  placeholderCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    borderRadius: 18,
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
    minHeight: 96,
    overflow: 'hidden',
    width: '100%',
  },
  placeholderTextWrap: {
    flex: 1,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
    justifyContent: 'center',
  },
  placeholderTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  placeholderSubtitle: { color: '#6b8693', fontSize: 12, marginTop: 6, lineHeight: 16 },
  placeholderImageWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0a3645',
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Warmup guide GIF thumbnail (matches training-card feel: image on right). */
  placeholderThumbWrap: {
    width: 90,
    height: 76,
    borderRadius: 14,
    backgroundColor: '#0a3645',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    margin: 10,
  },
  placeholderGuideImage: { width: '100%', height: '100%' },
  placeholderIcon: { fontSize: 22 },
  moduleRowScrollContent: { paddingRight: 24 },
  moduleRowCard: {
    width: MODULE_ROW_CARD_WIDTH,
    marginRight: MODULE_ROW_CARD_GAP,
    borderRadius: 14,
    backgroundColor: '#011f36',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#062731',
  },
  moduleRowCardBody: { padding: 10 },
  moduleRowThumbnail: { width: '100%', height: 72, borderRadius: 8, marginBottom: 6, backgroundColor: '#0a3645' },
  moduleRowThumbnailPlaceholder: { width: '100%', height: 72, borderRadius: 8, marginBottom: 6, backgroundColor: '#0a3645', justifyContent: 'center', alignItems: 'center' },
  moduleRowThumbnailIcon: { fontSize: 28 },
  moduleRowTitle: { color: '#FFF', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  moduleRowDesc: { color: '#6b8693', fontSize: 11, marginBottom: 2 },
  moduleRowDuration: { color: '#07bbc0', fontSize: 10, fontWeight: '600' },
  moduleListColumn: { gap: 12 },
  moduleListCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 96,
  },
  moduleListCardSelected: {
    borderColor: '#07bbc0',
    backgroundColor: 'rgba(7, 187, 192, 0.15)',
  },
  moduleListLeft: { flex: 1, paddingVertical: 14, paddingLeft: 16, paddingRight: 12, justifyContent: 'center' },
  moduleListRight: { width: 110, padding: 10, justifyContent: 'center', alignItems: 'center' },
  moduleListImage: { width: 90, height: 76, borderRadius: 14, backgroundColor: '#0a3645' },
  moduleListImagePlaceholder: { width: 90, height: 76, borderRadius: 14, backgroundColor: '#0a3645', justifyContent: 'center', alignItems: 'center' },
  moduleListImageIcon: { fontSize: 28 },
  moduleListPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(7, 187, 192, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.28)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  moduleListPillText: { color: '#07bbc0', fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  moduleListTitle: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  moduleListDesc: { color: '#6b8693', fontSize: 12, marginTop: 6, lineHeight: 16 },
  moduleListMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', marginTop: 8 },
  categoryHeading: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 16 },
  swipeHint: { color: '#6b8693', fontSize: 12, marginBottom: 12, letterSpacing: 0.5 },
  categoryErrorText: { color: '#f3a53a', fontSize: 12, marginBottom: 12 },
  categoryScrollContent: {
    paddingLeft: HORIZONTAL_PADDING,
    paddingRight: HORIZONTAL_PADDING + HORIZONTAL_CARD_GAP,
    paddingVertical: 8,
  },
  horizontalCardTouch: { marginRight: HORIZONTAL_CARD_GAP },
  categoryCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.25)',
  },
  categoryCardHorizontal: {
    shadowColor: '#07bbc0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  categoryCardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.35)',
    pointerEvents: 'none',
  },
  categoryCardImageWrap: { position: 'relative', height: 160, overflow: 'hidden' },
  categoryCardImageWrapHorizontal: { height: 300 },
  categoryCardImage: { width: '100%', height: '100%' },
  categoryCardImagePlaceholder: {
    width: '100%', height: '100%', backgroundColor: '#0a3645', justifyContent: 'center', alignItems: 'center',
  },
  categoryCardPlaceholderIcon: { fontSize: 48 },
  categoryCardGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 96,
    backgroundColor: 'rgba(4, 21, 39, 0.92)',
  },
  categoryCardContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  categoryCardTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  categoryCardCountRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, justifyContent: 'space-between' },
  categoryCardCountPill: { backgroundColor: 'rgba(7, 187, 192, 0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  categoryCardCount: { color: '#07bbc0', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  categoryCardChevron: { color: 'rgba(255,255,255,0.6)', fontSize: 22, fontWeight: '300', marginRight: 4 },
  loadingBox: { paddingVertical: 48, alignItems: 'center' },
  loadingText: { color: '#6b8693', fontSize: 14, marginTop: 12 },
  emptyBox: { paddingVertical: 48, alignItems: 'center' },
  emptyTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptySubtitle: { color: '#6b8693', fontSize: 14 },
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -CARD_MARGIN / 2 },
  moduleCard: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN / 2,
    marginBottom: CARD_MARGIN,
    borderRadius: 20,
    backgroundColor: '#011f36',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  lockedModuleCard: {
    opacity: 0.92,
  },
  lockedOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(4, 21, 39, 0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  lockedOverlayList: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(4, 21, 39, 0.64)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  lockedOverlayTitle: { color: '#07bbc0', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  lockedOverlaySubtitle: { color: '#d7e3e8', fontSize: 12, fontWeight: '600' },
  moduleHeader: { backgroundColor: '#062731', paddingVertical: 10, paddingHorizontal: 12 },
  moduleCategory: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  moduleBody: { padding: 12 },
  thumbnail: { width: '100%', height: 80, borderRadius: 12, marginBottom: 8, backgroundColor: '#0a3645' },
  thumbnailPlaceholder: { width: '100%', height: 80, borderRadius: 12, marginBottom: 8, backgroundColor: '#0a3645', justifyContent: 'center', alignItems: 'center' },
  thumbnailIcon: { fontSize: 32 },
  moduleTitle: { color: '#FFF', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  moduleDesc: { color: '#6b8693', fontSize: 12, marginBottom: 4 },
  duration: { color: '#07bbc0', fontSize: 11, fontWeight: '600' },
});

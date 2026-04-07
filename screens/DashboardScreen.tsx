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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthController, type ModuleItem } from '../lib/controllers/AuthController';
import type { Module } from '../lib/models/Module';
import type { SkillProfile } from '../lib/models/SkillProfile';
import type { ModuleTrainingStat } from '../lib/controllers/userProgress';
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

const MODULES_CACHE_KEY = 'dashboard_modules_cache';

function reviveCachedModules(raw: unknown): ModuleItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((item: Record<string, unknown>) => ({
    ...item,
    createdAt: item.createdAt ? new Date(item.createdAt as string | number) : new Date(),
    updatedAt: item.updatedAt ? new Date(item.updatedAt as string | number) : new Date(),
  })) as ModuleItem[];
}

const MODULE_CATEGORIES = ['Punching', 'Kicking', 'Elbow Strikes', 'Knee Strikes', 'Defensive Moves'] as const;

function normalizeCategory(cat: string | undefined): string {
  const s = (cat ?? '').trim().toLowerCase();
  return s === 'jab' ? 'punching' : s;
}

/** Animated category card for horizontal strip: hero image, gradient, glow border, press scale, slide-in. */
function TrainingCategoryCard({
  category,
  moduleCount,
  onPress,
  index = 0,
  cardWidth,
}: {
  category: string;
  moduleCount: number;
  onPress: () => void;
  index?: number;
  cardWidth: number;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(32)).current;
  const [imageError, setImageError] = useState(false);
  const imageSource = CATEGORY_IMAGES[category];
  const showImage = imageSource && !imageError;

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
              onError={() => setImageError(true)}
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
  onStartCategorySession: (payload: {
    category: string;
    warmups: string[];
    cooldowns: string[];
    trainingModules: ModuleItem[];
    startPhase?: 'warmup' | 'cooldown';
    mannequinGifUri?: string | null;
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
}

// --- Component ---
export default function DashboardScreen({
  onOpenModule,
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
}: DashboardScreenProps) {
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [recommendedModules, setRecommendedModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // -1 means: nothing selected yet; session starts from index 0.
  const [warmupStartCardIndex, setWarmupStartCardIndex] = useState<number>(-1);
  const [cooldownStartCardIndex, setCooldownStartCardIndex] = useState<number>(-1);
  const [completionTimestamps, setCompletionTimestamps] = useState<Record<string, number>>({});
  const [completedModuleIds, setCompletedModuleIds] = useState<string[]>([]);
  const [moduleTrainingStats, setModuleTrainingStats] = useState<Record<string, ModuleTrainingStat>>({});
  const [skillProfile, setSkillProfile] = useState<SkillProfile | null>(null);
  const [mlRecommendedModuleIds, setMlRecommendedModuleIds] = useState<string[]>([]);
  const [recModalVisible, setRecModalVisible] = useState(false);
  const [targetModulesPerDay, setTargetModulesPerDay] = useState(DEFAULT_MODULES_PER_DAY_GOAL);
  const [targetModulesPerWeek, setTargetModulesPerWeek] = useState(DEFAULT_MODULES_PER_WEEK_GOAL);
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasedModuleIds, setPurchasedModuleIds] = useState<string[]>([]);
  const [userCredits, setUserCredits] = useState(0);
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const [purchaseTargetModule, setPurchaseTargetModule] = useState<ModuleItem | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (recommendationsReopenToken <= 0) return;
    setRecModalVisible(true);
    onConsumeRecommendationsReopen?.();
  }, [recommendationsReopenToken, onConsumeRecommendationsReopen]);

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
      const [list, progress, currentUser, fullProfile, purchased, liveCredits] = await Promise.all([
        AuthController.getApprovedModules(),
        AuthController.getUserProgress(),
        AuthController.getCurrentUser(),
        AuthController.getFullSkillProfile(),
        getPurchasedModuleIds(),
        getUserCreditsBalance(),
      ]);
      if (done) return;
      const completedIds = Array.isArray(progress?.completedModuleIds) ? progress.completedModuleIds : [];
      setModules(list ?? []);
      setCompletionTimestamps(progress?.completionTimestamps ?? {});
      setCompletedModuleIds(completedIds);
      setModuleTrainingStats(progress?.moduleTrainingStats ?? {});
      setSkillProfile(fullProfile);
      setPurchasedModuleIds(purchased);
      setUserCredits(liveCredits);
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
            setRecommendedModules(notCompleted);
          });
        })
        .catch(() => {
          setMlRecommendedModuleIds([]);
          setRecommendedModules([]);
        });
    } catch (e) {
      if (!done) setModules([]);
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
    return personalizedRecIds.map((id) => byId.get(id)).filter((m): m is ModuleItem => m != null);
  }, [modules, personalizedRecIds]);

  const modulesInCategoryRaw = selectedCategory
    ? modules.filter((m) => normalizeCategory(m.category) === normalizeCategory(selectedCategory))
    : [];
  const modulesInCategory = [...modulesInCategoryRaw].sort((a, b) => {
    const sa = (a as any).sortOrder;
    const sb = (b as any).sortOrder;
    const aNum = typeof sa === 'number' ? sa : null;
    const bNum = typeof sb === 'number' ? sb : null;
    if (aNum != null && bNum != null) return aNum - bNum;
    if (aNum != null) return -1;
    if (bNum != null) return 1;
    return 0;
  });
  const unlockedModuleIdsByCategory = React.useMemo(() => {
    const byCategory = new Map<string, ModuleItem[]>();
    for (const mod of modules) {
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
    const categoryModules = modules.filter((m) => normalizeCategory(m.category) === normalizeCategory(category));
    return categoryModules.filter((m) => !unlockedModuleIdsByCategory.has(m.moduleId));
  }, [modules, unlockedModuleIdsByCategory]);
  const getCategoryBuyAllPrice = React.useCallback((category: string): number => {
    const payable = getPayableModulesForCategory(category);
    const alreadyPurchasedCount = payable.filter((m) => purchasedModuleIds.includes(m.moduleId)).length;
    const remainingCount = Math.max(0, payable.length - alreadyPurchasedCount);
    return remainingCount * 50;
  }, [getPayableModulesForCategory, purchasedModuleIds]);

  function top3MostCommon(values: (string | null | undefined)[]): string[] {
    const counts = new Map<string, { key: string; label: string; count: number }>();
    for (const raw of values) {
      const label = String(raw ?? '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { key, label, count: 1 });
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 3)
      .map((x) => x.label);
  }

  const warmupTop3 = top3MostCommon(
    modulesInCategory.flatMap((m) => ((m as any).warmupExercises as string[] | undefined) ?? [])
  );
  const cooldownTop3 = top3MostCommon(
    modulesInCategory.flatMap((m) => ((m as any).cooldownExercises as string[] | undefined) ?? [])
  );
  const warmupTop3Values = warmupTop3.length ? [...warmupTop3, '—', '—', '—'].slice(0, 3) : ['—', '—', '—'];
  const cooldownTop3Values = cooldownTop3.length ? [...cooldownTop3, '—', '—', '—'].slice(0, 3) : ['—', '—', '—'];

  useEffect(() => {
    // Reset the "start from here" warmup selection whenever the user changes category.
    setWarmupStartCardIndex(-1);
    setCooldownStartCardIndex(-1);
  }, [selectedCategory]);

  function groupByDifficulty<T extends { difficultyLevel?: string | null }>(
    list: T[],
    category: string | null
  ): { level: 'basic' | 'intermediate' | 'advanced' | 'cooldown' | 'other'; label: string; items: T[] }[] {
    // Consistent session flow across all categories:
    // Warmup/Cooldown sections are placeholders (exercise names), and all real modules are practiced in Training.
    return [
      { level: 'intermediate', label: 'Warmup', items: [] },
      { level: 'advanced', label: 'Training', items: [...list] },
      { level: 'cooldown', label: 'Cooldown', items: [] },
    ];
  }
  const modulesInCategoryByLevel = groupByDifficulty(modulesInCategory, selectedCategory);

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

  const renderModuleListCard = (mod: ModuleItem | Module, onPress: () => void, sectionLabel?: string, locked = false): React.ReactNode => {
    const durationMin = mod.videoDuration ? `${Math.ceil(mod.videoDuration / 60)} min` : '';
    return (
      <TouchableOpacity
        key={mod.moduleId}
        style={[styles.moduleListCard, locked && styles.lockedModuleCard]}
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
          {mod.description ? <Text style={styles.moduleListDesc} numberOfLines={2}>{mod.description}</Text> : null}
          {durationMin ? <Text style={styles.moduleListMeta}>{durationMin}</Text> : null}
        </View>
        <View style={styles.moduleListRight}>
          {mod.thumbnailUrl ? (
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
              <Text style={styles.weeklyGoalSubtitle}>
                {targetModulesPerDay} modules/day • {targetModulesPerWeek} modules/week
              </Text>
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
                onPress={() => setSelectedDay(i)}
                style={[styles.dayProgressTouch, i === selectedDay && styles.dayProgressTouchSelected]}
                activeOpacity={0.8}
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
              {MODULE_CATEGORIES.map((cat, index) => {
                const count = modules.filter((m) => normalizeCategory(m.category) === normalizeCategory(cat)).length;
                return (
                  <TrainingCategoryCard
                    key={cat}
                    category={cat}
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
                {CATEGORY_IMAGES[selectedCategory] != null ? (
                  <Image
                    source={CATEGORY_IMAGES[selectedCategory]}
                    style={styles.expandedCategoryHeroImage}
                    resizeMode="cover"
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
              {modulesInCategory.length === 0 ? (
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
                                    opacity: isDisabled ? 0.5 : isSelected ? 1 : 0.65,
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
                                    : { backgroundColor: '#011f36', borderColor: '#062731', opacity: 0.65 },
                              ];
                              const cooldownGuide = getCooldownGuideSource(t);

                              return (
                                <TouchableOpacity
                                  key={`${label}-${idx}`}
                                  style={cooldownCardStyle}
                                  activeOpacity={0.9}
                                  disabled={isDisabled}
                                  onPress={() => {
                                    if (!isSelectable) return;
                                    // Only one phase can be selected at a time.
                                    setWarmupStartCardIndex(-1);
                                    setCooldownStartCardIndex(idx);
                                  }}
                                >
                                  <View style={styles.placeholderTextWrap}>
                                    <Text style={styles.placeholderTitle} numberOfLines={1}>{t}</Text>
                                    <Text style={styles.placeholderSubtitle}>
                                      {isSelected ? 'Start here' : 'Tap to start here'}
                                    </Text>
                                  </View>
                                  <View style={styles.placeholderThumbWrap}>
                                    {cooldownGuide && !isDisabled && isSelected ? (
                                      <Image source={cooldownGuide} style={styles.placeholderGuideImage} resizeMode="cover" />
                                    ) : (
                                      <Text style={styles.placeholderIcon}>{isSelected ? '▶' : '🥋'}</Text>
                                    )}
                                  </View>
                                </TouchableOpacity>
                              );
                            }

                            const warmupGuide = getWarmupGuideSource(t);
                            return (
                              <TouchableOpacity
                                key={`${label}-${idx}`}
                                style={cardStyle}
                                activeOpacity={0.9}
                                disabled={isDisabled}
                                onPress={() => {
                                  if (!isSelectable) return;
                                  // Tap warmup card to start session from that warmup.
                                  // Only one phase can be selected at a time.
                                  setCooldownStartCardIndex(-1);
                                  setWarmupStartCardIndex(idx);
                                }}
                              >
                                <View style={styles.placeholderTextWrap}>
                                  <Text style={styles.placeholderTitle} numberOfLines={1}>{t}</Text>
                                  <Text style={styles.placeholderSubtitle}>
                                    {isSelected ? 'Start here' : 'Tap to start here'}
                                  </Text>
                                </View>
                                <View style={styles.placeholderThumbWrap}>
                                  {warmupGuide && !isDisabled && isSelected ? (
                                    <Image source={warmupGuide} style={styles.placeholderGuideImage} resizeMode="cover" />
                                  ) : (
                                    <Text style={styles.placeholderIcon}>{isSelected ? '▶' : '🥋'}</Text>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
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
                                // Start category practice directly at the selected training module
                                // (no module "introduction" page).
                                const cooldownStartIdx = cooldownStartCardIndex >= 0 ? cooldownStartCardIndex : 0;
                                const selectedCooldowns = cooldownTop3Values.filter(
                                  (c, idx) => idx >= cooldownStartIdx && c && c !== '—'
                                );

                                // Slice training modules so the first training module is the one tapped.
                                const trainingSlice = items.slice(modIdx);

                                onStartCategorySession({
                                  category: selectedCategory ?? 'Punching',
                                  warmups: [],
                                  cooldowns:
                                    selectedCooldowns.length > 0
                                      ? selectedCooldowns
                                      : cooldownTop3Values.filter((c) => c && c !== '—'),
                                  trainingModules: trainingSlice,
                                  mannequinGifUri: null,
                                });
                                return;
                              }

                              onOpenModule(mod.moduleId, mod);
                            }, label, label === 'Training' ? isModuleLocked(mod.moduleId) : false)
                          )}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </Animated.View>
          </ScrollView>
          </Animated.View>
          {modulesInCategory.length > 0 && (
            <TouchableOpacity
              style={styles.categoryFloatingStartButton}
              onPress={() => {
                const trainingSection = modulesInCategoryByLevel.find((x) => x.label === 'Training');
                const trainingModules = trainingSection?.items ?? [];
                const hasCooldownStartSelection = cooldownStartCardIndex >= 0 && warmupStartCardIndex < 0;

                if (!trainingModules.length && !hasCooldownStartSelection) {
                  showToast('No training modules found for this category.');
                  return;
                }

                const warmupStartIdx = warmupStartCardIndex >= 0 ? warmupStartCardIndex : 0;
                const cooldownStartIdx = cooldownStartCardIndex >= 0 ? cooldownStartCardIndex : 0;
                const warmupsToDo = warmupTop3Values.filter((v, idx) => idx >= warmupStartIdx && v !== '—');
                const selectedCooldowns = cooldownTop3Values.filter((c, idx) => idx >= cooldownStartIdx && c && c !== '—');
                const allWarmups = warmupTop3Values.filter((v) => v !== '—');
                const allCooldowns = cooldownTop3Values.filter((c) => c && c !== '—');

                onStartCategorySession({
                  category: selectedCategory ?? 'Punching',
                  // If user selected a cooldown start card, begin directly in cooldown flow.
                  warmups: hasCooldownStartSelection ? [] : (warmupsToDo.length ? warmupsToDo : allWarmups),
                  cooldowns: selectedCooldowns.length ? selectedCooldowns : allCooldowns,
                  trainingModules,
                  startPhase: hasCooldownStartSelection ? 'cooldown' : 'warmup',
                  mannequinGifUri: null,
                });
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.categoryFloatingStartButtonText}>Start</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

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
                        setRecModalVisible(false);
                        if (onStartRecommendedSingleSession) {
                          onStartRecommendedSingleSession(mod);
                        } else {
                          onOpenModule(mod.moduleId, mod);
                        }
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
              <Text style={styles.paywallPriceLabel}>Your balance</Text>
              <Text style={styles.paywallCreditsValue}>{userCredits} credits</Text>
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
  recModalClose: {
    marginTop: 6,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  recModalCloseText: { color: '#07bbc0', fontSize: 15, fontWeight: '700' },
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
  paywallPriceLabel: { color: '#6b8693', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  paywallCreditsValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginBottom: 8 },
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
  weeklyGoalSubtitle: { fontSize: 12, color: '#6b8693', marginTop: 2 },
  weeklyGoalStats: { alignItems: 'flex-end' },
  weeklyGoalPercentage: { fontSize: 24, fontWeight: '700', color: '#07bbc0' },
  progressBarBackground: { height: 8, backgroundColor: '#0a3645', borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
  progressBarFill: { height: 8, backgroundColor: '#07bbc0', borderRadius: 8 },
  weekDaysRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
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
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  placeholderTextWrap: { flex: 1, paddingRight: 8 },
  placeholderTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  placeholderSubtitle: { color: '#6b8693', fontSize: 12 },
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
    width: 76,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#0a3645',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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

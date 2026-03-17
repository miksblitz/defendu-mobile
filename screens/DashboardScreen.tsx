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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthController, type ModuleItem } from '../lib/controllers/AuthController';
import type { Module } from '../lib/models/Module';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';

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
const MODULES_PER_DAY_GOAL = 5;
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
  /** When this changes (e.g. after returning from a module), progress is refetched so weekly goal updates. */
  refreshKey?: number;
  /** Shown once when landing on dashboard (e.g. after publishing a module). */
  initialToastMessage?: string | null;
  onClearInitialToast?: () => void;
}

// --- Component ---
export default function DashboardScreen({ onOpenModule, refreshKey = 0, initialToastMessage, onClearInitialToast }: DashboardScreenProps) {
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [recommendedModules, setRecommendedModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [completionTimestamps, setCompletionTimestamps] = useState<Record<string, number>>({});
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [refreshing, setRefreshing] = useState(false);

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
      const [list, progress] = await Promise.all([
        AuthController.getApprovedModules(),
        AuthController.getUserProgress(),
      ]);
      if (done) return;
      const completedIds = Array.isArray(progress?.completedModuleIds) ? progress.completedModuleIds : [];
      setModules(list ?? []);
      setCompletionTimestamps(progress?.completionTimestamps ?? {});
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
          if (!recs?.recommendedModuleIds?.length) {
            setRecommendedModules([]);
            return;
          }
          return AuthController.getModulesByIds(recs.recommendedModuleIds).then((recommended) => {
            const notCompleted = recommended.filter((m) => !completedIds.includes(m.moduleId));
            setRecommendedModules(notCompleted);
          });
        })
        .catch(() => setRecommendedModules([]));
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

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadDashboardData();
  }, [loadDashboardData]);

  const todayIndex = (new Date().getDay() + 6) % 7;
  const dayCounts = getDayCountsThisWeek(completionTimestamps);
  const dayProgress = dayCounts.map((c) => Math.min(1, c / MODULES_PER_DAY_GOAL));
  const weeklyProgress = dayProgress.length
    ? dayProgress.reduce((a, b) => a + b, 0) / 7
    : 0;

  const modulesInCategoryRaw = selectedCategory
    ? modules.filter((m) => normalizeCategory(m.category) === normalizeCategory(selectedCategory))
    : [];
  const modulesInCategory = modulesInCategoryRaw;

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

  function groupByDifficulty<T extends { difficultyLevel?: string | null }>(
    list: T[],
    category: string | null
  ): { level: 'basic' | 'intermediate' | 'advanced' | 'cooldown' | 'other'; label: string; items: T[] }[] {
    if (category === 'Punching') {
      return [
        { level: 'intermediate', label: 'Warmup', items: [] },
        { level: 'advanced', label: 'Training', items: [...list] },
        { level: 'cooldown', label: 'Cooldown', items: [] },
      ];
    }
    const basic = list.filter((m) => (m.difficultyLevel ?? '').toLowerCase() === 'basic');
    const intermediate = list.filter((m) => (m.difficultyLevel ?? '').toLowerCase() === 'intermediate');
    const advanced = list.filter((m) => (m.difficultyLevel ?? '').toLowerCase() === 'advanced');
    const cooldown = list.filter((m) => (m.difficultyLevel ?? '').toLowerCase() === 'cooldown');
    const other = list.filter((m) => {
      const L = (m.difficultyLevel ?? '').toLowerCase();
      return L !== 'basic' && L !== 'intermediate' && L !== 'advanced' && L !== 'cooldown';
    });
    const out: { level: 'basic' | 'intermediate' | 'advanced' | 'cooldown' | 'other'; label: string; items: T[] }[] = [];
    const warmupItems = [...basic, ...intermediate];
    if (warmupItems.length) out.push({ level: 'intermediate', label: 'Warmup', items: warmupItems });
    if (advanced.length) out.push({ level: 'advanced', label: 'Training', items: advanced });
    if (cooldown.length) out.push({ level: 'cooldown', label: 'Cooldown', items: cooldown });
    if (other.length) out.push({ level: 'other', label: 'More', items: other });
    if (!cooldown.length) out.push({ level: 'cooldown', label: 'Cooldown', items: [] });
    return out;
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

  const renderModuleCard = (mod: ModuleItem | Module, onPress: () => void): React.ReactNode => {
    const durationMin = mod.videoDuration ? `${Math.ceil(mod.videoDuration / 60)} min` : '';
    return (
      <TouchableOpacity key={mod.moduleId} style={styles.moduleCard} activeOpacity={0.8} onPress={onPress}>
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

  const renderModuleListCard = (mod: ModuleItem | Module, onPress: () => void, sectionLabel?: string): React.ReactNode => {
    const durationMin = mod.videoDuration ? `${Math.ceil(mod.videoDuration / 60)} min` : '';
    return (
      <TouchableOpacity
        key={mod.moduleId}
        style={styles.moduleListCard}
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
              {recommendedModules.slice(0, 4).map((mod: Module) => renderModuleCard(mod, () => onOpenModule(mod.moduleId, mod)))}
            </View>
          </View>
        )}

        <View style={styles.weeklyGoalContainer}>
          <Image source={require('../assets/images/defendudashboardlogo.png')} style={styles.weeklyGoalLogo} resizeMode="contain" />
          <View style={styles.weeklyGoalHeader}>
            <View>
              <Text style={styles.weeklyGoalTitle}>Weekly Goal</Text>
              <Text style={styles.weeklyGoalSubtitle}>5 modules per day • Resets every Monday</Text>
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
          <ScrollView style={styles.categoryOverlayScroll} contentContainerStyle={styles.categoryOverlayContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
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
                          {((label === 'Warmup' ? warmupTop3 : cooldownTop3).length
                            ? (label === 'Warmup' ? warmupTop3 : cooldownTop3)
                            : ['—', '—', '—']
                          ).map((t, idx) => (
                            <View key={`${label}-${idx}`} style={styles.placeholderCard}>
                              <View style={styles.placeholderTextWrap}>
                                <Text style={styles.placeholderTitle} numberOfLines={1}>{t}</Text>
                                <Text style={styles.placeholderSubtitle}>
                                  {label === 'Warmup' ? 'Warm-up exercise' : 'Cooldown stretch'}
                                </Text>
                              </View>
                              <View style={styles.placeholderImageWrap}>
                                <Text style={styles.placeholderIcon}>🥋</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                      <View style={styles.moduleListColumn}>
                        {items.length > 0 &&
                          items.map((mod: ModuleItem) =>
                            renderModuleListCard(mod, () => onOpenModule(mod.moduleId, mod), label)
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
                const first = modulesInCategory[0];
                if (first) onOpenModule(first.moduleId, first);
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.categoryFloatingStartButtonText}>Start</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
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
    bottom: 24,
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

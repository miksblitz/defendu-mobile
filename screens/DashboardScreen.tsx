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
} from 'react-native';
import { AuthController, type ModuleItem } from '../lib/controllers/AuthController';
import type { Module } from '../lib/models/Module';

/** Training category hero images (copy your 5 images to assets/images/training/ with these names). */
const CATEGORY_IMAGES: Record<string, ReturnType<typeof require>> = {
  'Punching': require('../assets/images/training/punching.png'),
  'Kicking': require('../assets/images/training/kicking.png'),
  'Elbow Strikes': require('../assets/images/training/elbow-strikes.png'),
  'Palm Strikes': require('../assets/images/training/palm-strikes.png'),
  'Defensive Moves': require('../assets/images/training/defensive-moves.png'),
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 12;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 2 - 24) / 2 - CARD_MARGIN / 2;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MODULES_PER_DAY_GOAL = 5;
/** @deprecated Weekly progress now comes from completionTimestamps/dayProgress. Kept to avoid ReferenceError if cache references it. */
const progressValues = [0, 0, 0, 0, 0, 0, 0];

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

const MODULE_CATEGORIES = [
  'Punching',
  'Kicking',
  'Elbow Strikes',
  'Palm Strikes',
  'Defensive Moves',
] as const;

function normalizeCategory(cat: string | undefined): string {
  return (cat ?? '').trim().toLowerCase();
}

/** Animated category card with hero image, gradient overlay, and press scale. */
function TrainingCategoryCard({
  category,
  moduleCount,
  onPress,
  index = 0,
}: {
  category: string;
  moduleCount: number;
  onPress: () => void;
  index?: number;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const [imageError, setImageError] = useState(false);
  const imageSource = CATEGORY_IMAGES[category];
  const showImage = imageSource && !imageError;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 320,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacityAnim, translateY]);

  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 80,
      bounciness: 0,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 80,
      bounciness: 4,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View
        style={[
          styles.categoryCard,
          {
            opacity: opacityAnim,
            transform: [{ translateY }, { scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.categoryCardImageWrap}>
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
            <Text style={styles.categoryCardCount}>
              {moduleCount} module{moduleCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

interface DashboardScreenProps {
  onOpenModule: (moduleId: string) => void;
}

export default function DashboardScreen({ onOpenModule }: DashboardScreenProps) {
  const [userName, setUserName] = useState('User');
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [recommendedModules, setRecommendedModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [completionTimestamps, setCompletionTimestamps] = useState<Record<string, number>>({});
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 6) % 7);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const user = await AuthController.getCurrentUser();
      if (cancelled) return;
      if (user) {
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email?.split('@')[0] || 'User';
        setUserName(name);
      }
      try {
        const [list, recs, progress] = await Promise.all([
          AuthController.getApprovedModules(),
          AuthController.getRecommendations(),
          AuthController.getUserProgress(),
        ]);
        if (cancelled) return;
        setModules(list);
        setCompletionTimestamps(progress.completionTimestamps ?? {});
        if (recs?.recommendedModuleIds?.length) {
          const recommended = await AuthController.getModulesByIds(recs.recommendedModuleIds);
          const notCompleted = recommended.filter((m) => !progress.completedModuleIds.includes(m.moduleId));
          setRecommendedModules(notCompleted);
        } else {
          setRecommendedModules([]);
        }
      } catch (e) {
        if (!cancelled) setModules([]);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const todayIndex = (new Date().getDay() + 6) % 7;
  const todayName = DAYS[todayIndex];
  const dayCounts = getDayCountsThisWeek(completionTimestamps);
  const dayProgress = dayCounts.map((c) => Math.min(1, c / MODULES_PER_DAY_GOAL));
  const weeklyProgress = dayProgress.length
    ? dayProgress.reduce((a, b) => a + b, 0) / 7
    : 0;
  const selectedDayCount = dayCounts[selectedDay] ?? 0;
  const selectedDayPct = Math.min(100, Math.round((selectedDayCount / MODULES_PER_DAY_GOAL) * 100));

  const modulesInCategory = selectedCategory
    ? modules.filter((m) => normalizeCategory(m.category) === normalizeCategory(selectedCategory))
    : [];

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

  return (
    <View style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <Image source={require('../assets/images/defendulogo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.welcomeText}>Welcome back, {userName}!</Text>
          <Text style={styles.welcomeSubtext}>Today is {todayName} – Let's keep training</Text>
        </View>

        {recommendedModules.length > 0 && (
          <View style={styles.recommendationsSection}>
            <Text style={styles.recommendationsTitle}>Recommended for you</Text>
            <Text style={styles.recommendationsSubtext}>Best suited to your profile.</Text>
            <View style={styles.moduleGrid}>
              {recommendedModules.slice(0, 4).map((mod: Module) => renderModuleCard(mod, () => onOpenModule(mod.moduleId)))}
            </View>
          </View>
        )}

        <View style={styles.weeklyGoalContainer}>
          <View style={styles.weeklyGoalHeader}>
            <View>
              <Text style={styles.weeklyGoalTitle}>Weekly Goal</Text>
              <Text style={styles.weeklyGoalSubtitle}>5 modules per day • Resets every Monday</Text>
            </View>
            <View style={styles.weeklyGoalStats}>
              <Text style={styles.weeklyGoalPercentage}>{Math.round(weeklyProgress * 100)}%</Text>
              <Text style={styles.weeklyGoalLabel}>Complete</Text>
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
                  <Text style={styles.dayCountText}>{dayCounts[i] ?? 0}/{MODULES_PER_DAY_GOAL}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {selectedDay !== null && (
            <View style={styles.selectedDaySummary}>
              <Text style={styles.selectedDaySummaryText}>
                {DAYS[selectedDay]}: {selectedDayPct}% ({selectedDayCount} of {MODULES_PER_DAY_GOAL} modules)
                {selectedDay === todayIndex ? ' • Complete modules today to increase' : ' • Past day (view only)'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TRAINING MODULES</Text>
          <Text style={styles.sectionSubtitle}>
            {selectedCategory ? `Tap a module to start.` : 'Choose a category, then pick a module.'}
          </Text>
        </View>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#07bbc0" />
            <Text style={styles.loadingText}>Loading modules...</Text>
          </View>
        ) : selectedCategory ? (
          <>
            <TouchableOpacity
              style={styles.backCategoryRow}
              onPress={() => setSelectedCategory(null)}
              activeOpacity={0.7}
            >
              <Image source={require('../assets/images/icon-back.png')} style={styles.backIcon} resizeMode="contain" />
              <Text style={styles.backCategoryText}>Back to categories</Text>
            </TouchableOpacity>
            <Text style={styles.categoryHeading}>{selectedCategory}</Text>
            {modulesInCategory.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No modules in this category yet</Text>
                <Text style={styles.emptySubtitle}>Check back later for new content.</Text>
              </View>
            ) : (
              <View style={styles.moduleGrid}>
                {modulesInCategory.map((mod: ModuleItem) => renderModuleCard(mod, () => onOpenModule(mod.moduleId)))}
              </View>
            )}
          </>
        ) : modules.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No modules available yet</Text>
            <Text style={styles.emptySubtitle}>Check back later for new training content.</Text>
          </View>
        ) : (
          <View style={styles.categoryList}>
            {MODULE_CATEGORIES.map((cat, index) => {
              const count = modules.filter((m) => normalizeCategory(m.category) === normalizeCategory(cat)).length;
              return (
                <TrainingCategoryCard
                  key={cat}
                  category={cat}
                  moduleCount={count}
                  index={index}
                  onPress={() => setSelectedCategory(cat)}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  welcomeSection: { marginBottom: 24 },
  logo: { width: 140, height: 100, alignSelf: 'center', marginBottom: 12 },
  welcomeText: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  welcomeSubtext: { fontSize: 14, color: '#6b8693' },
  recommendationsSection: { marginBottom: 24 },
  recommendationsTitle: { fontSize: 18, fontWeight: '700', color: '#07bbc0', marginBottom: 4 },
  recommendationsSubtext: { fontSize: 13, color: '#6b8693', marginBottom: 12 },
  weeklyGoalContainer: { backgroundColor: '#011f36', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#062731' },
  weeklyGoalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  weeklyGoalTitle: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  weeklyGoalSubtitle: { fontSize: 12, color: '#6b8693', marginTop: 2 },
  weeklyGoalStats: { alignItems: 'flex-end' },
  weeklyGoalPercentage: { fontSize: 24, fontWeight: '700', color: '#07bbc0' },
  weeklyGoalLabel: { fontSize: 11, color: '#6b8693', marginTop: 2 },
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
  dayCountText: { color: '#FFF', fontSize: 11, marginTop: 2 },
  selectedDaySummary: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#062731' },
  selectedDaySummaryText: { color: '#6b8693', fontSize: 12 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#07bbc0', letterSpacing: 2, marginBottom: 4 },
  sectionSubtitle: { fontSize: 14, color: '#6b8693' },
  backCategoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backIcon: { width: 24, height: 24, marginRight: 8 },
  backCategoryText: { color: '#07bbc0', fontSize: 15, fontWeight: '600' },
  categoryHeading: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 16 },
  categoryList: { gap: 16 },
  categoryCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.25)',
  },
  categoryCardImageWrap: { position: 'relative', height: 160, overflow: 'hidden' },
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
    height: 90,
    backgroundColor: 'rgba(4, 21, 39, 0.88)',
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
  categoryCardCount: { color: '#07bbc0', fontSize: 13, fontWeight: '600', marginTop: 4, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
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

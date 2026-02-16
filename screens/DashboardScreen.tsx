import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { AuthController, type ModuleItem } from '../lib/controllers/AuthController';
import type { Module } from '../lib/models/Module';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 12;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 2 - 24) / 2 - CARD_MARGIN / 2;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const progressValues = [1, 0.8, 0.6, 0.3, 0, 0, 0];

interface DashboardScreenProps {
  onOpenModule: (moduleId: string) => void;
}

export default function DashboardScreen({ onOpenModule }: DashboardScreenProps) {
  const [userName, setUserName] = useState('User');
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [recommendedModules, setRecommendedModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

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
        setCompletedModuleIds(progress.completedModuleIds);
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
  const weeklyProgress = progressValues.reduce((a, b) => a + b, 0) / DAYS.length;

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
            <Text style={styles.weeklyGoalTitle}>Weekly Goal</Text>
            <Text style={styles.weeklyGoalPercentage}>{Math.round(weeklyProgress * 100)}%</Text>
          </View>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${weeklyProgress * 100}%` }]} />
          </View>
          <View style={styles.weekDaysRow}>
            {DAYS.map((day, i) => (
              <Text key={day} style={[styles.dayLabel, i === todayIndex && styles.dayLabelActive]}>{day}</Text>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TRAINING MODULES</Text>
          <Text style={styles.sectionSubtitle}>Browse by category. Tap a module to start.</Text>
        </View>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#07bbc0" />
            <Text style={styles.loadingText}>Loading modules...</Text>
          </View>
        ) : modules.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No modules available yet</Text>
            <Text style={styles.emptySubtitle}>Check back later for new training content.</Text>
          </View>
        ) : (
          <View style={styles.moduleGrid}>
            {modules.map((mod: ModuleItem) => renderModuleCard(mod, () => onOpenModule(mod.moduleId)))}
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
  weeklyGoalPercentage: { fontSize: 24, fontWeight: '700', color: '#07bbc0' },
  progressBarBackground: { height: 8, backgroundColor: '#0a3645', borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
  progressBarFill: { height: 8, backgroundColor: '#07bbc0', borderRadius: 8 },
  weekDaysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayLabel: { color: '#6b8693', fontSize: 12 },
  dayLabelActive: { color: '#07bbc0', fontWeight: '600' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#07bbc0', letterSpacing: 2, marginBottom: 4 },
  sectionSubtitle: { fontSize: 14, color: '#6b8693' },
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

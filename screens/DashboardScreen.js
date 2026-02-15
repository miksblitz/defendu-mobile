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
import { AuthController } from '../lib/controllers/AuthController';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 12;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 2 - 24) / 2 - CARD_MARGIN / 2;

export default function DashboardScreen({ onLogout }) {
  const [userName, setUserName] = useState('User');
  const [modules, setModules] = useState([]);
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
      const list = await AuthController.getApprovedModules();
      if (!cancelled) setModules(list);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    await AuthController.logout();
    onLogout();
  };

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIndex = (new Date().getDay() + 6) % 7;
  const todayName = days[todayIndex];

  return (
    <View style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Dashboard</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.welcomeSection}>
          <Image source={require('../assets/images/defendulogo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.welcomeText}>Welcome back, {userName}!</Text>
          <Text style={styles.welcomeSubtext}>Today is {todayName} – Let's keep training</Text>
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
            {modules.map((mod) => {
              const durationMin = mod.videoDuration ? `${Math.ceil(mod.videoDuration / 60)} min` : '';
              return (
                <TouchableOpacity key={mod.moduleId} style={styles.moduleCard} activeOpacity={0.8}>
                  <View style={styles.moduleHeader}>
                    <Text style={styles.moduleCategory} numberOfLines={1}>{mod.category || 'Other'}</Text>
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
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  logoutButton: { paddingVertical: 8, paddingHorizontal: 16 },
  logoutText: { color: '#00AABB', fontWeight: '600', fontSize: 16 },
  welcomeSection: { marginBottom: 24 },
  logo: { width: 140, height: 100, alignSelf: 'center', marginBottom: 12 },
  welcomeText: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  welcomeSubtext: { fontSize: 14, color: '#6b8693' },
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

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import type { TrainerModuleAnalyticsRow } from '../lib/controllers/trainerAnalytics';

type Props = {
  module: TrainerModuleAnalyticsRow;
  onBack: () => void;
};

function formatCredits(n: number): string {
  const safe = Number(n ?? 0);
  if (!Number.isFinite(safe)) return '0';
  return safe.toLocaleString();
}

function formatShortDate(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return '—';
  }
}

export default function TrainerInsightsModuleScreen({ module, onBack }: Props) {
  return (
    <View style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerLeftSpacer} />
        <Text style={styles.headerTitle} numberOfLines={1}>Overview</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.moduleTitle} numberOfLines={2}>{module.moduleTitle}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{module.category}</Text>
          </View>
        </View>

        {module.thumbnailUrl ? (
          <Image source={{ uri: module.thumbnailUrl }} style={styles.hero} resizeMode="cover" />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Text style={styles.heroIcon}>🥋</Text>
          </View>
        )}

        <View style={styles.kpiGrid}>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>Buyers</Text>
            <Text style={styles.kpiValue}>{module.buyers}</Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>Credit sales</Text>
            <Text style={styles.kpiValue}>{formatCredits(module.creditsGross)}</Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>Avg credits/buyer</Text>
            <Text style={styles.kpiValue}>{Math.round(module.avgCreditsPerBuyer || 0)}</Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>Last sale</Text>
            <Text style={styles.kpiValue}>{formatShortDate(module.lastPurchasedAt)}</Text>
          </View>
        </View>

        <View style={styles.footerSpace} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  header: {
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#062731',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeftSpacer: { width: 72 },
  headerTitle: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  headerRightSpacer: { width: 72 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 26 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  moduleTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '900', textAlign: 'left' },
  badge: { backgroundColor: 'rgba(7, 187, 192, 0.14)', borderWidth: 1, borderColor: '#07bbc0', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  badgeText: { color: '#07bbc0', fontSize: 12, fontWeight: '900' },
  hero: { width: '100%', height: 170, borderRadius: 18, marginTop: 12, backgroundColor: '#0a3645' },
  heroPlaceholder: { width: '100%', height: 170, borderRadius: 18, marginTop: 12, backgroundColor: '#0a3645', alignItems: 'center', justifyContent: 'center' },
  heroIcon: { fontSize: 54 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  kpiTile: { flexBasis: '48%', flexGrow: 1, flexShrink: 1, backgroundColor: '#011f36', borderWidth: 1, borderColor: '#062731', borderRadius: 18, padding: 14, minHeight: 84 },
  kpiLabel: { color: '#6b8693', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'left' },
  kpiValue: { color: '#07bbc0', fontSize: 18, fontWeight: '900', marginTop: 8, textAlign: 'left' },
  footerSpace: { height: 20 },
});


import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { AuthController } from '../lib/controllers/AuthController';
import type { TrainerModuleAnalyticsResponse, TrainerModuleAnalyticsRow } from '../lib/controllers/trainerAnalytics';

type Props = {
  onBack: () => void;
  onOpenModule: (row: TrainerModuleAnalyticsRow) => void;
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

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? '').trim().toLowerCase();
}

function getStatusStyle(status: string | null | undefined): { label: string; bg: string; text: string; border: string } {
  const normalized = normalizeStatus(status);
  if (normalized === 'approved') return { label: 'Approved', bg: 'rgba(34,197,94,0.18)', text: '#4ade80', border: 'rgba(34,197,94,0.45)' };
  if (normalized === 'pending review') return { label: 'Pending review', bg: 'rgba(245,158,11,0.18)', text: '#fbbf24', border: 'rgba(245,158,11,0.45)' };
  if (normalized === 'rejected') return { label: 'Rejected', bg: 'rgba(239,68,68,0.18)', text: '#f87171', border: 'rgba(239,68,68,0.45)' };
  return { label: status ? String(status) : 'Unknown', bg: 'rgba(100,116,139,0.22)', text: '#cbd5e1', border: 'rgba(100,116,139,0.45)' };
}

export default function TrainerInsightsScreen({ onBack, onOpenModule }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrainerModuleAnalyticsResponse | null>(null);

  const topModule = useMemo(() => (data?.modules?.length ? data.modules[0] : null), [data]);

  const load = async (variant: 'initial' | 'refresh') => {
    try {
      if (variant === 'initial') setLoading(true);
      if (variant === 'refresh') setRefreshing(true);
      setError(null);
      const res = await AuthController.getTrainerPublishedModuleAnalytics();
      setData(res);
    } catch (e) {
      setData(null);
      setError((e as Error)?.message || 'Could not load trainer insights.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load('initial');
  }, []);

  return (
    <View style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerLeftSpacer} />
        <Text style={styles.headerTitle}>Trainer Insights</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#07bbc0" />
          <Text style={styles.centerText}>Loading insights…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t load insights</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load('initial')} activeOpacity={0.9}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor="#07bbc0" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Your published performance</Text>
            <Text style={styles.heroSub}>Buyers and credit sales across your modules.</Text>
            <View style={styles.summaryRow}>
              <View style={[styles.tile, styles.tileSmall]}>
                <Text style={styles.tileLabel}>Modules</Text>
                <Text style={styles.tileValue}>{data?.totals?.modules ?? 0}</Text>
              </View>
              <View style={[styles.tile, styles.tileSmall]}>
                <Text style={styles.tileLabel}>Buyers</Text>
                <Text style={styles.tileValue}>{formatCredits(data?.totals?.buyers ?? 0)}</Text>
              </View>
              <View style={[styles.tile, styles.tileLarge]}>
                <Text style={styles.tileLabel}>Credit Sales</Text>
                <Text style={styles.tileValue}>{formatCredits(data?.totals?.creditsGross ?? 0)}</Text>
              </View>
            </View>
          </View>

          {topModule ? (
            <View style={styles.highlight}>
              <Text style={styles.highlightTitle}>Top module</Text>
              <Text style={styles.highlightName} numberOfLines={1}>{topModule.moduleTitle}</Text>
              <Text style={styles.highlightMeta}>
                {topModule.buyers} buyers · {formatCredits(topModule.creditsGross)} credits · last sale {formatShortDate(topModule.lastPurchasedAt)}
              </Text>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Published Modules</Text>
            <Text style={styles.sectionHint}>Tap card or Edit to update your module details.</Text>
          </View>

          {!data?.modules?.length ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No published modules yet</Text>
              <Text style={styles.emptySub}>Publish and get approved to see insights here.</Text>
            </View>
          ) : (
            data.modules.map((m) => (
              <TouchableOpacity key={m.moduleId} style={styles.moduleCard} onPress={() => onOpenModule(m)} activeOpacity={0.9}>
                <View style={styles.cardTopRow}>
                  {m.thumbnailUrl ? (
                    <Image source={{ uri: m.thumbnailUrl }} style={styles.thumb} />
                  ) : (
                    <View style={styles.thumbPlaceholder}><Text style={styles.thumbIcon}>🥋</Text></View>
                  )}
                  <View style={styles.statusWrap}>
                    <View style={[styles.statusChip, { backgroundColor: getStatusStyle(m.status).bg, borderColor: getStatusStyle(m.status).border }]}>
                      <Text style={[styles.statusText, { color: getStatusStyle(m.status).text }]}>{getStatusStyle(m.status).label}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.moduleBody}>
                  <Text style={styles.moduleTitle} numberOfLines={1}>{m.moduleTitle}</Text>
                  <Text style={styles.moduleMeta} numberOfLines={1}>
                    {m.category} · last sale {formatShortDate(m.lastPurchasedAt)}
                  </Text>
                  <View style={styles.kpiRow}>
                    <View style={[styles.kpiChip, styles.kpiChipLarge]}>
                      <Text style={styles.kpiLabel}>Buyers</Text>
                      <Text style={styles.kpiValue}>{m.buyers}</Text>
                    </View>
                    <View style={[styles.kpiChip, styles.kpiChipCredits]}>
                      <Text style={styles.kpiLabel}>Credits</Text>
                      <Text style={styles.kpiValue}>{formatCredits(m.creditsGross)}</Text>
                    </View>
                    <View style={[styles.kpiChip, styles.kpiChipAvg]}>
                      <Text style={styles.kpiLabel}>Avg</Text>
                      <Text style={styles.kpiValue}>{Math.round(m.avgCreditsPerBuyer || 0)}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.cardActionRow}>
                  <TouchableOpacity style={[styles.ctaBtn, styles.ctaEditBtn]} onPress={() => onOpenModule(m)} activeOpacity={0.9}>
                    <Text style={styles.ctaEditText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}

          <View style={styles.footerSpace} />
        </ScrollView>
      )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  centerText: { color: '#6b8693', fontSize: 13, fontWeight: '600' },
  errorTitle: { color: '#FFF', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  errorSub: { color: '#6b8693', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 14, lineHeight: 18 },
  retryBtn: { backgroundColor: '#07bbc0', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  retryBtnText: { color: '#041527', fontSize: 14, fontWeight: '900' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 28 },
  heroCard: { backgroundColor: '#011f36', borderWidth: 1, borderColor: '#062731', borderRadius: 18, padding: 14 },
  heroTitle: { color: '#FFF', fontSize: 16, fontWeight: '900', textAlign: 'left' },
  heroSub: { color: '#6b8693', fontSize: 12, marginTop: 6, lineHeight: 18, textAlign: 'left' },
  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tile: { flex: 1, backgroundColor: '#041527', borderWidth: 1, borderColor: '#062731', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12 },
  tileSmall: { flex: 0.9 },
  tileLarge: { flex: 1.2 },
  tileLabel: { color: '#6b8693', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'left' },
  tileValue: { color: '#07bbc0', fontSize: 18, fontWeight: '900', marginTop: 6, textAlign: 'left' },
  highlight: { marginTop: 12, backgroundColor: '#062731', borderWidth: 1, borderColor: '#0a3645', borderRadius: 18, padding: 14 },
  highlightTitle: { color: '#6b8693', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'left' },
  highlightName: { color: '#FFF', fontSize: 15, fontWeight: '900', marginTop: 8, textAlign: 'left' },
  highlightMeta: { color: '#b0c4d0', fontSize: 12, marginTop: 6, lineHeight: 18, textAlign: 'left' },
  sectionHeader: { marginTop: 16, marginBottom: 8 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '900', textAlign: 'left' },
  sectionHint: { color: '#6b8693', fontSize: 12, marginTop: 4, textAlign: 'left' },
  moduleCard: { backgroundColor: '#041527', borderWidth: 1, borderColor: '#062731', borderRadius: 18, padding: 12, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  thumb: { width: 58, height: 58, borderRadius: 14, backgroundColor: '#0a3645' },
  thumbPlaceholder: { width: 58, height: 58, borderRadius: 14, backgroundColor: '#0a3645', alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { fontSize: 22 },
  statusWrap: { flex: 1, alignItems: 'flex-end', marginLeft: 10 },
  statusChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '800' },
  moduleBody: { flex: 1, minWidth: 0 },
  moduleTitle: { color: '#FFF', fontSize: 14, fontWeight: '900', textAlign: 'left' },
  moduleMeta: { color: '#6b8693', fontSize: 12, marginTop: 4, textAlign: 'left' },
  kpiRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  kpiChip: { flex: 1, backgroundColor: '#011f36', borderWidth: 1, borderColor: '#062731', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, minHeight: 56 },
  kpiChipLarge: { flex: 1.05 },
  kpiChipCredits: { flex: 0.95 },
  kpiChipAvg: { flex: 0.85 },
  kpiLabel: { color: '#6b8693', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'left' },
  kpiValue: { color: '#07bbc0', fontSize: 13, fontWeight: '900', marginTop: 4, textAlign: 'left' },
  cardActionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  ctaBtn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  ctaEditBtn: { backgroundColor: '#07bbc0' },
  ctaEditText: { color: '#041527', fontSize: 13, fontWeight: '900' },
  emptyWrap: { marginTop: 10, backgroundColor: '#011f36', borderWidth: 1, borderColor: '#062731', borderRadius: 18, padding: 16, alignItems: 'center' },
  emptyTitle: { color: '#FFF', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptySub: { color: '#6b8693', fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  footerSpace: { height: 20 },
});


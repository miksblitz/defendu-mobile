import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { WorkoutSessionSummary } from '../lib/session/workoutSessionTypes';
import { formatDurationCompact, formatDurationMs } from '../lib/session/workoutSessionTypes';

type Props = {
  summary: WorkoutSessionSummary;
  onContinue: () => void;
  continueLoading?: boolean;
};

function StatTile({
  label,
  value,
  accent,
  delay,
}: {
  label: string;
  value: string;
  accent: string;
  delay: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 520,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 520,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[styles.statTile, { borderColor: accent, opacity, transform: [{ translateY }] }]}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

export default function WorkoutSessionAnalyticsView({ summary, onContinue, continueLoading = false }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const headerGlow = useRef(new Animated.Value(0.35)).current;

  const repTotal = summary.totalCorrectReps + summary.totalBadReps;
  const accuracyPct = repTotal > 0 ? Math.round((summary.totalCorrectReps / repTotal) * 100) : 100;

  const headline = summary.outcome === 'completed' ? 'Mission Complete' : 'Session Recap';
  const subline =
    summary.outcome === 'completed'
      ? `You powered through ${summary.category} — here is your fight report.`
      : `You stepped off the mat early — your progress still counts.`;

  const modulesLabel = useMemo(() => {
    const n = summary.modules.length;
    if (n === 0) return 'No training modules logged';
    if (n === 1) return '1 module in this session';
    return `${n} modules in this session`;
  }, [summary.modules.length]);

  useEffect(() => {
    if (!summary.isNewPersonalBest) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [summary.isNewPersonalBest, pulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(headerGlow, { toValue: 0.85, duration: 1400, useNativeDriver: true }),
        Animated.timing(headerGlow, { toValue: 0.35, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [headerGlow]);

  const pbScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bgOrbTop} />
      <View style={styles.bgOrbBottom} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.heroBadge, { opacity: headerGlow }]}>
          <Image source={require('../assets/images/defendulogo.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Text style={styles.eyebrow}>{summary.category.toUpperCase()}</Text>
        <Text style={styles.title}>{headline}</Text>
        <Text style={styles.subtitle}>{subline}</Text>

        <View style={styles.ringCard}>
          <View style={styles.ringOuter}>
            <View style={[styles.ringArc, { width: `${accuracyPct}%` }]} />
            <View style={styles.ringInner}>
              <Text style={styles.ringPct}>{accuracyPct}%</Text>
              <Text style={styles.ringCaption}>Rep accuracy</Text>
            </View>
          </View>
          <View style={styles.ringMeta}>
            <Text style={styles.durationHero}>{formatDurationMs(summary.durationMs)}</Text>
            <Text style={styles.durationLabel}>Total mat time</Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <StatTile label="Clean reps" value={String(summary.totalCorrectReps)} accent="#3dffa8" delay={80} />
          <StatTile label="Off reps" value={String(summary.totalBadReps)} accent="#ff7b7b" delay={160} />
          <StatTile label="Modules" value={String(summary.modules.length)} accent="#07bbc0" delay={240} />
        </View>

        <View style={styles.pbCard}>
          <View style={styles.pbHeader}>
            <Text style={styles.pbTitle}>Personal best</Text>
            {summary.isNewPersonalBest ? (
              <Animated.View style={[styles.pbNewBadge, { transform: [{ scale: pbScale }] }]}>
                <Text style={styles.pbNewText}>NEW RECORD</Text>
              </Animated.View>
            ) : null}
          </View>
          <Text style={styles.pbTime}>
            {summary.personalBestMs != null ? formatDurationMs(summary.personalBestMs) : '—'}
          </Text>
          <Text style={styles.pbHint}>
            {summary.outcome === 'completed'
              ? summary.isNewPersonalBest
                ? 'Fastest full category finish — saved to your profile.'
                : 'Beat this time on your next full category run.'
              : 'Finish the full category workout to set or improve your record.'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Modules you trained</Text>
        <Text style={styles.sectionMeta}>{modulesLabel}</Text>

        {summary.modules.length === 0 ? (
          <View style={styles.emptyModules}>
            <Text style={styles.emptyModulesText}>Warmups and cooldowns still count toward your session time.</Text>
          </View>
        ) : (
          summary.modules.map((mod, idx) => {
            const modTotal = mod.correctReps + mod.badReps;
            const modAcc = modTotal > 0 ? Math.round((mod.correctReps / modTotal) * 100) : 0;
            return (
              <View key={`${mod.moduleId}-${idx}`} style={styles.moduleCard}>
                <View style={styles.moduleCardTop}>
                  <Text style={styles.moduleTitle} numberOfLines={2}>
                    {mod.title}
                  </Text>
                  {mod.completed ? (
                    <View style={styles.donePill}>
                      <Text style={styles.donePillText}>CLEARED</Text>
                    </View>
                  ) : (
                    <View style={styles.partialPill}>
                      <Text style={styles.partialPillText}>PARTIAL</Text>
                    </View>
                  )}
                </View>
                <View style={styles.moduleBarTrack}>
                  <View style={[styles.moduleBarGood, { flex: mod.correctReps || 0.001 }]} />
                  <View style={[styles.moduleBarBad, { flex: mod.badReps || 0.001 }]} />
                </View>
                <View style={styles.moduleStatsRow}>
                  <Text style={styles.moduleStatGood}>{mod.correctReps} clean</Text>
                  <Text style={styles.moduleStatBad}>{mod.badReps} off</Text>
                  <Text style={styles.moduleStatMuted}>{modAcc}% · {formatDurationCompact(mod.durationMs)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.nextButton, continueLoading && styles.nextButtonDisabled]}
          onPress={onContinue}
          disabled={continueLoading}
          accessibilityRole="button"
        >
          {continueLoading ? (
            <ActivityIndicator color="#031322" />
          ) : (
            <Text style={styles.nextButtonText}>Next — Rate your trainers</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#031322' },
  bgOrbTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(7, 187, 192, 0.14)',
  },
  bgOrbBottom: {
    position: 'absolute',
    bottom: 120,
    left: -70,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(61, 255, 168, 0.08)',
  },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  heroBadge: {
    alignSelf: 'center',
    marginBottom: 6,
    padding: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(7, 187, 192, 0.12)',
  },
  logo: { width: 56, height: 56 },
  eyebrow: {
    color: '#07bbc0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
    textAlign: 'center',
  },
  title: {
    color: '#FFF',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  ringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(1, 31, 54, 0.88)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.22)',
    padding: 16,
    marginBottom: 14,
    gap: 14,
  },
  ringOuter: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255, 107, 107, 0.18)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  ringArc: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
    backgroundColor: 'rgba(61, 255, 168, 0.55)',
  },
  ringInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3, 19, 34, 0.72)',
    margin: 10,
    borderRadius: 36,
  },
  ringPct: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  ringCaption: { color: '#6b8693', fontSize: 10, marginTop: 2, fontWeight: '700' },
  ringMeta: { flex: 1 },
  durationHero: { color: '#07bbc0', fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'] },
  durationLabel: { color: '#6b8693', fontSize: 13, marginTop: 4, fontWeight: '600' },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statTile: {
    flex: 1,
    backgroundColor: 'rgba(1, 31, 54, 0.9)',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#6b8693', fontSize: 11, marginTop: 4, fontWeight: '700', textAlign: 'center' },
  pbCard: {
    backgroundColor: 'rgba(7, 187, 192, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.28)',
    padding: 16,
    marginBottom: 18,
  },
  pbHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  pbTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  pbNewBadge: {
    backgroundColor: 'rgba(61, 255, 168, 0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(61, 255, 168, 0.55)',
  },
  pbNewText: { color: '#3dffa8', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  pbTime: { color: '#07bbc0', fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'] },
  pbHint: { color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 19, marginTop: 6 },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  sectionMeta: { color: '#6b8693', fontSize: 13, marginTop: 4, marginBottom: 10 },
  emptyModules: {
    backgroundColor: 'rgba(1, 31, 54, 0.75)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.15)',
  },
  emptyModulesText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  moduleCard: {
    backgroundColor: 'rgba(1, 31, 54, 0.92)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.14)',
  },
  moduleCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  moduleTitle: { flex: 1, color: '#FFF', fontSize: 16, fontWeight: '800', lineHeight: 21 },
  donePill: {
    backgroundColor: 'rgba(61, 255, 168, 0.16)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(61, 255, 168, 0.4)',
  },
  donePillText: { color: '#3dffa8', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  partialPill: {
    backgroundColor: 'rgba(255, 193, 7, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.35)',
  },
  partialPillText: { color: '#ffc107', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  moduleBarTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  moduleBarGood: { backgroundColor: '#3dffa8' },
  moduleBarBad: { backgroundColor: '#ff6b6b' },
  moduleStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  moduleStatGood: { color: '#3dffa8', fontSize: 12, fontWeight: '700' },
  moduleStatBad: { color: '#ff7b7b', fontSize: 12, fontWeight: '700' },
  moduleStatMuted: { color: '#6b8693', fontSize: 12, fontWeight: '600' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 18,
    paddingTop: 12,
    backgroundColor: 'rgba(3, 19, 34, 0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(7, 187, 192, 0.18)',
  },
  nextButton: {
    backgroundColor: '#07bbc0',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  nextButtonDisabled: { opacity: 0.72 },
  nextButtonText: { color: '#031322', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
});

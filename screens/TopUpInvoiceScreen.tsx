import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import type { TopUpInvoice } from '../lib/controllers/payments';

const { width: SCREEN_W } = Dimensions.get('window');

interface TopUpInvoiceScreenProps {
  invoice: TopUpInvoice;
  newCredits: number;
  onDone: () => void;
}

function formatReceiptDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

/** Decorative dots for a subtle “confetti” band */
function DotBand({ style }: { style?: object }) {
  const dots = Array.from({ length: 14 }, (_, i) => (
    <View key={i} style={[styles.dot, { opacity: 0.15 + (i % 4) * 0.08 }]} />
  ));
  return <View style={[styles.dotBand, style]}>{dots}</View>;
}

export default function TopUpInvoiceScreen({ invoice, newCredits, onDone }: TopUpInvoiceScreenProps) {
  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.glowOrbLarge} pointerEvents="none" />
        <View style={styles.glowOrbSmall} pointerEvents="none" />

        <View style={styles.hero}>
          <Image
            source={require('../assets/images/defendudashboardlogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.paidBadge}>
            <Text style={styles.paidBadgeText}>PAID</Text>
          </View>
        </View>

        <Text style={styles.thankYou}>Thank you!</Text>
        <Text style={styles.thankSub}>
          Your payment went through. Your Defendu Credits are ready—keep sharpening your skills.
        </Text>

        <DotBand style={styles.dotBandMargin} />

        <View style={styles.ticketOuter}>
          <View style={styles.ticketNotchLeft} />
          <View style={styles.ticketNotchRight} />
          <View style={styles.ticketInner}>
            <Text style={styles.ticketLabel}>Official receipt</Text>
            <Text style={styles.invoiceHero}>{invoice.invoiceNo}</Text>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Credits added</Text>
              <Text style={styles.rowValueAccent}>+{invoice.creditsAdded}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Amount paid</Text>
              <Text style={styles.rowValue}>PHP {invoice.amountPhp.toFixed(2)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>New balance</Text>
              <Text style={styles.rowValueHighlight}>{newCredits.toLocaleString()} credits</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Date</Text>
              <Text style={styles.rowValue}>{formatReceiptDate(invoice.createdAt)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.monoBlock}>
              <Text style={styles.monoLabel}>Reference</Text>
              <Text style={styles.monoValue} selectable>
                {invoice.sourceId}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.closingCard}>
          <Text style={styles.closingTitle}>You’re all set</Text>
          <Text style={styles.closingBody}>
            We appreciate your support. Every credit helps us bring you clearer coaching, sharper modules,
            and a stronger community. See you on the mat.
          </Text>
          <Text style={styles.signature}>— Team Defendu</Text>
        </View>

        <TouchableOpacity style={styles.primaryCta} onPress={onDone} activeOpacity={0.9}>
          <Text style={styles.primaryCtaText}>Continue training</Text>
        </TouchableOpacity>

        <Text style={styles.footerTag}>DEFENDU · TRAIN SMARTER</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#041527',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
    alignItems: 'center',
  },
  glowOrbLarge: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#07bbc0',
    opacity: 0.07,
  },
  glowOrbSmall: {
    position: 'absolute',
    bottom: 120,
    left: -50,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#07bbc0',
    opacity: 0.06,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
    maxWidth: 340,
  },
  logo: {
    width: Math.min(SCREEN_W - 80, 280),
    height: 72,
    opacity: 0.95,
  },
  paidBadge: {
    position: 'absolute',
    top: 0,
    right: 16,
    backgroundColor: 'rgba(7, 187, 192, 0.22)',
    borderWidth: 1,
    borderColor: '#07bbc0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    transform: [{ rotate: '12deg' }],
  },
  paidBadgeText: {
    color: '#07bbc0',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  thankYou: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 16,
    letterSpacing: -0.5,
  },
  thankSub: {
    color: '#8aa3ae',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 320,
    paddingHorizontal: 4,
  },
  dotBand: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 20,
  },
  dotBandMargin: {
    marginBottom: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#07bbc0',
    marginHorizontal: 4,
    marginVertical: 3,
  },
  ticketOuter: {
    marginTop: 14,
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#011f36',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.35)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    position: 'relative',
  },
  ticketNotchLeft: {
    position: 'absolute',
    left: -8,
    top: '42%',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#041527',
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.25)',
  },
  ticketNotchRight: {
    position: 'absolute',
    right: -8,
    top: '42%',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#041527',
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.25)',
  },
  ticketInner: {
    paddingHorizontal: 8,
  },
  ticketLabel: {
    color: '#6b8693',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  invoiceHero: {
    color: '#07bbc0',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(107, 134, 147, 0.35)',
    marginVertical: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingRight: 2,
  },
  rowLabel: {
    color: '#6b8693',
    fontSize: 14,
    fontWeight: '600',
  },
  rowValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '55%',
    textAlign: 'right',
  },
  rowValueAccent: {
    color: '#07bbc0',
    fontSize: 18,
    fontWeight: '900',
  },
  rowValueHighlight: {
    color: '#07bbc0',
    fontSize: 15,
    fontWeight: '800',
  },
  monoBlock: {
    backgroundColor: 'rgba(4, 21, 39, 0.65)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.15)',
  },
  monoLabel: {
    color: '#6b8693',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  monoValue: {
    color: '#9eb8c4',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  closingCard: {
    marginTop: 28,
    width: '100%',
    maxWidth: 360,
    padding: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(7, 187, 192, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.2)',
  },
  closingTitle: {
    color: '#07bbc0',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  closingBody: {
    color: '#b8ccd4',
    fontSize: 14,
    lineHeight: 22,
  },
  signature: {
    color: '#07bbc0',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 14,
    fontStyle: 'italic',
  },
  primaryCta: {
    marginTop: 28,
    backgroundColor: '#07bbc0',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  primaryCtaText: {
    color: '#041527',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  footerTag: {
    marginTop: 22,
    color: '#3d5a66',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
});

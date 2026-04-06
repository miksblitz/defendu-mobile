import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, Linking, ActivityIndicator } from 'react-native';
import { checkPaymentServerHealth, createGcashPayment, createQrPayment } from '../lib/controllers/payments';

const CREDIT_PACKS = [
  { id: 'starter', credits: 250, price: 'PHP 99', bonus: '' },
  { id: 'popular', credits: 500, price: 'PHP 179', bonus: '+50 bonus' },
  { id: 'pro', credits: 1200, price: 'PHP 399', bonus: '+200 bonus' },
];

type TopUpStep = 'packs' | 'payment';

interface TopUpScreenProps {
  step: TopUpStep;
  onStepChange: (step: TopUpStep) => void;
}

const QR_CODE_IMAGE = require('../assets/images/qrcode.png');
const GCASH_LOGO_IMAGE = require('../assets/images/gcash.png');

export default function TopUpScreen({ step, onStepChange }: TopUpScreenProps) {
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [payingMethod, setPayingMethod] = useState<'gcash' | 'qr' | null>(null);
  const [checkingServer, setCheckingServer] = useState(false);
  const [serverHealthy, setServerHealthy] = useState(true);
  const selectedPack = CREDIT_PACKS.find((p) => p.id === selectedPackId) ?? null;
  const selectedAmount = selectedPack ? Number((selectedPack.price || '').replace(/[^\d.]/g, '')) : 0;

  useEffect(() => {
    if (step !== 'payment') return;
    let cancelled = false;
    (async () => {
      setCheckingServer(true);
      const ok = await checkPaymentServerHealth();
      if (cancelled) return;
      setServerHealthy(ok);
      setCheckingServer(false);
    })();
    return () => { cancelled = true; };
  }, [step]);

  const handlePayWithGcash = async () => {
    if (!selectedPack || selectedAmount <= 0) return;
    setPayingMethod('gcash');
    try {
      const result = await createGcashPayment(selectedAmount, `${selectedPack.credits} Defendu Credits`);
      if (!result.checkoutUrl) {
        throw new Error('Checkout URL not returned by server');
      }
      await Linking.openURL(result.checkoutUrl);
    } catch (e) {
      Alert.alert('Payment error', (e as Error)?.message || 'Could not start GCash payment.');
    } finally {
      setPayingMethod(null);
    }
  };

  const handlePayWithQr = async () => {
    if (!selectedPack || selectedAmount <= 0) return;
    setPayingMethod('qr');
    try {
      const result = await createQrPayment(selectedAmount, `${selectedPack.credits} Defendu Credits`);
      if (!result.qrCodeUrl) {
        Alert.alert('QR Ready', 'QR source created. QR image URL was not returned by server.');
        return;
      }
      await Linking.openURL(result.qrCodeUrl);
    } catch (e) {
      Alert.alert('Payment error', (e as Error)?.message || 'Could not start QR payment.');
    } finally {
      setPayingMethod(null);
    }
  };

  return (
    <View style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 'packs' ? (
          <>
            <Text style={styles.title}>Top Up Credits</Text>
            <Text style={styles.subtitle}>
              Buy Defendu Credits and unlock premium training modules.
            </Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Choose Credit Pack</Text>
              {CREDIT_PACKS.map((pack) => {
                const isSelected = selectedPackId === pack.id;
                return (
                  <TouchableOpacity
                    key={pack.id}
                    style={[styles.packCard, isSelected && styles.packCardSelected]}
                    activeOpacity={0.88}
                    onPress={() => setSelectedPackId(pack.id)}
                  >
                    <View>
                      <Text style={styles.packCredits}>{pack.credits} Credits</Text>
                      {pack.bonus ? <Text style={styles.packBonus}>{pack.bonus}</Text> : null}
                    </View>
                    <Text style={styles.packPrice}>{pack.price}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, !selectedPackId && styles.buttonDisabled]}
              activeOpacity={0.9}
              disabled={!selectedPackId}
              onPress={() => onStepChange('payment')}
            >
              <Text style={styles.primaryButtonText}>Continue to Payment</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Payment Method</Text>
            <Text style={styles.subtitle}>
              Selected pack: {selectedPack ? `${selectedPack.credits} Credits (${selectedPack.price})` : 'None'}
            </Text>
            {checkingServer ? (
              <Text style={styles.healthCheckText}>Checking payment server...</Text>
            ) : !serverHealthy ? (
              <Text style={styles.healthWarningText}>
                Payment server is unreachable right now. Please try again later.
              </Text>
            ) : null}

            <View style={styles.section}>
              <TouchableOpacity style={styles.methodCard} activeOpacity={0.88} onPress={handlePayWithGcash} disabled={payingMethod != null || !serverHealthy}>
                {payingMethod === 'gcash' ? (
                  <ActivityIndicator color="#07bbc0" />
                ) : (
                  <Image source={GCASH_LOGO_IMAGE} style={styles.gcashLogo} resizeMode="contain" />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.methodCard} activeOpacity={0.88} onPress={handlePayWithQr} disabled={payingMethod != null || !serverHealthy}>
                {payingMethod === 'qr' ? (
                  <ActivityIndicator color="#07bbc0" />
                ) : (
                  <Image source={QR_CODE_IMAGE} style={styles.qrThumbRight} resizeMode="contain" />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  content: { paddingHorizontal: 20, paddingVertical: 20, paddingBottom: 36 },
  title: { color: '#07bbc0', fontSize: 26, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#6b8693', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  healthCheckText: { color: '#6b8693', fontSize: 12, marginBottom: 10 },
  healthWarningText: { color: '#e57373', fontSize: 12, marginBottom: 10 },
  section: { marginBottom: 18 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  packCard: {
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packCardSelected: {
    borderColor: '#07bbc0',
    borderWidth: 2,
    backgroundColor: 'rgba(7, 187, 192, 0.14)',
  },
  packCredits: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  packBonus: { color: '#07bbc0', fontSize: 12, fontWeight: '700', marginTop: 2 },
  packPrice: { color: '#07bbc0', fontSize: 15, fontWeight: '800' },
  methodCard: {
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 14,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    width: '78%',
    alignSelf: 'center',
  },
  gcashLogo: { width: '100%', height: 130, borderRadius: 10 },
  qrThumbRight: { width: '100%', height: 138, borderRadius: 10 },
  primaryButton: {
    backgroundColor: '#07bbc0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: { color: '#041527', fontSize: 16, fontWeight: '800' },
  buttonDisabled: { opacity: 0.55 },
});

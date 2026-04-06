import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Linking, ActivityIndicator } from 'react-native';
import { checkPaymentServerHealth, confirmTopUpPayment, createQrPayment } from '../lib/controllers/payments';

const CREDIT_PACKS = [
  { id: 'starter', credits: 250, price: 'PHP 99', bonus: '' },
  { id: 'popular', credits: 500, price: 'PHP 179', bonus: '+50 bonus' },
  { id: 'pro', credits: 1200, price: 'PHP 399', bonus: '+200 bonus' },
];

type TopUpStep = 'packs' | 'payment';

interface TopUpScreenProps {
  step: TopUpStep;
  onStepChange: (step: TopUpStep) => void;
  onCreditsUpdated?: (newCredits: number) => void;
}

export default function TopUpScreen({ step, onStepChange, onCreditsUpdated }: TopUpScreenProps) {
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [payingMethod, setPayingMethod] = useState<'qr' | null>(null);
  const [checkingServer, setCheckingServer] = useState(false);
  const [serverHealthy, setServerHealthy] = useState(true);
  const [generatedQrDataUrl, setGeneratedQrDataUrl] = useState<string | null>(null);
  const [generatedCheckoutUrl, setGeneratedCheckoutUrl] = useState<string | null>(null);
  const [generatedSourceId, setGeneratedSourceId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<{
    invoiceNo: string;
    sourceId: string;
    amountPhp: number;
    creditsAdded: number;
    createdAt: number;
  } | null>(null);
  const [autoCheckStatus, setAutoCheckStatus] = useState<string | null>(null);
  const [autoCheckError, setAutoCheckError] = useState<string | null>(null);
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

  const handlePayWithQr = async () => {
    if (!selectedPack || selectedAmount <= 0) return;
    setPayingMethod('qr');
    setGeneratedQrDataUrl(null);
    setGeneratedCheckoutUrl(null);
    setGeneratedSourceId(null);
    setInvoice(null);
    setAutoCheckError(null);
    setAutoCheckStatus('Waiting for payment confirmation...');
    try {
      const result = await createQrPayment(selectedAmount, `${selectedPack.credits} Defendu Credits`);
      const qrRenderable = result.qrCodeDataUrl || result.qrCodeUrl;
      if (!qrRenderable) {
        Alert.alert('QR error', 'QR image was not returned by server.');
        return;
      }
      setGeneratedQrDataUrl(qrRenderable);
      setGeneratedCheckoutUrl(result.checkoutUrl || null);
      setGeneratedSourceId(result.sourceId || null);
    } catch (e) {
      Alert.alert('Payment error', (e as Error)?.message || 'Could not start QR payment.');
    } finally {
      setPayingMethod(null);
    }
  };

  useEffect(() => {
    if (step !== 'payment' || !generatedSourceId || !selectedPack || invoice) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 75; // ~5 minutes at 4s intervals
    const intervalMs = 4000;
    const timer = setInterval(async () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        if (!cancelled) setAutoCheckStatus('Payment not confirmed yet. If you already paid, tap "I Completed Payment".');
        return;
      }
      try {
        setAutoCheckStatus('Checking payment status...');
        const result = await confirmTopUpPayment(generatedSourceId, selectedPack.credits);
        if (cancelled) return;
        onCreditsUpdated?.(result.newCredits);
        if (result.invoice) setInvoice(result.invoice);
        setAutoCheckError(null);
        setAutoCheckStatus(`Payment confirmed. Credits updated to ${result.newCredits}.`);
        clearInterval(timer);
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error)?.message || 'Waiting for payment confirmation...';
        const pending = msg.toLowerCase().includes('not completed') || msg.toLowerCase().includes('pending');
        if (pending) {
          setAutoCheckError(null);
          setAutoCheckStatus('Waiting for payment confirmation...');
        } else {
          setAutoCheckError(msg);
          setAutoCheckStatus('Payment check failed. Retrying...');
        }
      }
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [generatedSourceId, invoice, onCreditsUpdated, selectedPack, step]);

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
              <TouchableOpacity style={styles.methodCard} activeOpacity={0.88} onPress={handlePayWithQr} disabled={payingMethod != null || !serverHealthy}>
                {payingMethod === 'qr' ? (
                  <ActivityIndicator color="#07bbc0" />
                ) : (
                  <Text style={styles.generateQrText}>Generate Payment QR</Text>
                )}
              </TouchableOpacity>
              {generatedQrDataUrl ? (
                <View style={styles.generatedQrWrap}>
                  <Image source={{ uri: generatedQrDataUrl }} style={styles.generatedQrImage} resizeMode="contain" />
                  <Text style={styles.generatedQrHint}>Scan this QR to continue to test payment.</Text>
                  {autoCheckStatus ? <Text style={styles.autoCheckStatus}>{autoCheckStatus}</Text> : null}
                  {autoCheckError ? <Text style={styles.autoCheckError}>{autoCheckError}</Text> : null}
                  {generatedCheckoutUrl ? (
                    <TouchableOpacity style={styles.openCheckoutBtn} onPress={() => Linking.openURL(generatedCheckoutUrl)} activeOpacity={0.85}>
                      <Text style={styles.openCheckoutBtnText}>Open Checkout Link</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              {invoice ? (
                <View style={styles.invoiceCard}>
                  <Text style={styles.invoiceTitle}>Payment Invoice</Text>
                  <Text style={styles.invoiceLine}>Invoice: {invoice.invoiceNo}</Text>
                  <Text style={styles.invoiceLine}>Source ID: {invoice.sourceId}</Text>
                  <Text style={styles.invoiceLine}>Amount: PHP {invoice.amountPhp.toFixed(2)}</Text>
                  <Text style={styles.invoiceLine}>Credits Added: {invoice.creditsAdded}</Text>
                  <Text style={styles.invoiceLine}>
                    Date: {new Date(invoice.createdAt).toLocaleString()}
                  </Text>
                </View>
              ) : null}
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
  generateQrText: { color: '#07bbc0', fontSize: 18, fontWeight: '800' },
  generatedQrWrap: {
    marginTop: 10,
    alignItems: 'center',
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  generatedQrImage: { width: 260, height: 260, borderRadius: 8, backgroundColor: '#fff' },
  generatedQrHint: { marginTop: 10, color: '#6b8693', fontSize: 12, textAlign: 'center' },
  autoCheckStatus: { marginTop: 8, color: '#07bbc0', fontSize: 12, textAlign: 'center' },
  autoCheckError: { marginTop: 6, color: '#e57373', fontSize: 11, textAlign: 'center' },
  openCheckoutBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  openCheckoutBtnText: { color: '#07bbc0', fontSize: 13, fontWeight: '700' },
  invoiceCard: {
    marginTop: 12,
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 12,
    padding: 12,
  },
  invoiceTitle: { color: '#07bbc0', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  invoiceLine: { color: '#FFFFFF', fontSize: 12, marginBottom: 4 },
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

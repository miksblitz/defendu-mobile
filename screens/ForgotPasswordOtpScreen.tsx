/**
 * ForgotPasswordOtpScreen
 * Second step of the OTP-based forgot password flow. The user enters the 6-digit code
 * we emailed in `ForgotPasswordScreen`. On verify, the API returns a short-lived reset
 * token; we hand it back to App.tsx which navigates to the existing ResetPasswordScreen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { AuthController } from '../lib/controllers/AuthController';

interface ForgotPasswordOtpScreenProps {
  email: string;
  onBack: () => void;
  onVerified: (token: string) => void;
}

export default function ForgotPasswordOtpScreen({ email, onBack, onVerified }: ForgotPasswordOtpScreenProps) {
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const inputsRef = useRef<Array<TextInput | null>>([]);
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();

  useEffect(() => {
    const t = setTimeout(() => inputsRef.current[0]?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const maskedEmail = useMemo(() => {
    const [name, domain] = email.split('@');
    if (!name || !domain) return email;
    const visible = name.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
  }, [email]);

  const handleVerify = async () => {
    const code = otpDigits.join('').trim();
    if (!/^\d{6}$/.test(code)) {
      showToast('Please enter the full 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const { token } = await AuthController.verifyForgotPasswordOtp(email, code);
      showToast('Code verified. Set your new password.');
      setTimeout(() => onVerified(token), 600);
    } catch (error) {
      showToast((error as Error)?.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    try {
      await AuthController.sendForgotPasswordOtp(email);
      showToast('A new code was sent to your email.');
      setResendCooldown(30);
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => inputsRef.current[0]?.focus(), 120);
    } catch (error) {
      showToast((error as Error)?.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Enter the code</Text>
        <Text style={styles.subtitle}>We sent a 6-digit code to</Text>
        <Text style={styles.email}>{maskedEmail}</Text>

        <View style={styles.otpRow}>
          {otpDigits.map((digit, idx) => (
            <TextInput
              key={idx}
              ref={(el) => { inputsRef.current[idx] = el; }}
              style={styles.otpCell}
              value={digit}
              onChangeText={(t) => {
                const clean = t.replace(/[^\d]/g, '');
                setOtpDigits((prev) => {
                  const next = [...prev];
                  if (clean.length <= 1) {
                    next[idx] = clean;
                    return next;
                  }
                  const pasted = clean.slice(0, 6).split('');
                  for (let i = 0; i < 6; i += 1) next[i] = pasted[i] ?? '';
                  return next;
                });
                if (clean.length > 1) {
                  const nextFocus = Math.min(clean.length, 6) - 1;
                  setTimeout(() => inputsRef.current[nextFocus]?.focus(), 0);
                } else if (clean && idx < 5) {
                  setTimeout(() => inputsRef.current[idx + 1]?.focus(), 0);
                }
              }}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
                  setTimeout(() => inputsRef.current[idx - 1]?.focus(), 0);
                }
              }}
              keyboardType="number-pad"
              editable={!loading}
              maxLength={1}
              textAlign="center"
              selectTextOnFocus
            />
          ))}
        </View>
        <Text style={styles.helperText}>Check your inbox and spam/junk folder. The code expires in 10 minutes.</Text>

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Verify Code</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.linkBtn, (resendCooldown > 0 || loading) && styles.buttonDisabled]}
          onPress={handleResend}
          disabled={resendCooldown > 0 || loading}
        >
          <Text style={styles.linkText}>
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backBtn} onPress={onBack} disabled={loading}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#041527' },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#8fa3b0', fontSize: 14, textAlign: 'center' },
  email: { color: '#07bbc0', fontSize: 16, textAlign: 'center', marginTop: 6, marginBottom: 26, fontWeight: '600' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  otpCell: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0a3645',
    backgroundColor: '#01151F',
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
  },
  helperText: { color: '#8fa3b0', fontSize: 12, textAlign: 'center', marginBottom: 16 },
  button: {
    backgroundColor: '#00AABB',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  linkBtn: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#07bbc0', fontWeight: '700', fontSize: 14 },
  backBtn: { marginTop: 20, alignItems: 'center' },
  backText: { color: '#FFF', fontSize: 14 },
});

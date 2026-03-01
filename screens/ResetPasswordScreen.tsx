/**
 * ResetPasswordScreen
 * Set new password after reset link. Token from deep link or email.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { validateResetToken, confirmPasswordReset } from '../lib/controllers/AuthController';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

// --- Types ---
interface ResetPasswordScreenProps {
  token: string;
  onSuccess: () => void;
  onInvalidLink: () => void;
}

// --- Helpers ---
function validatePassword(password: string): string {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  return '';
}

// --- Component ---
export default function ResetPasswordScreen({ token, onSuccess, onInvalidLink }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await validateResetToken(token);
      if (cancelled) return;
      setValidating(false);
      if (result.valid) setValid(true);
      else {
        setError(result.error);
        showToast(result.error);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async () => {
    const pwdError = validatePassword(password);
    if (pwdError) {
      showToast(pwdError);
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await confirmPasswordReset(token, password);
      showToast('Password reset successfully! You can now log in.');
      setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Failed to reset password. Please try again.';
      setError(msg);
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#00AABB" />
          <Text style={styles.loadingText}>Checking reset link...</Text>
        </View>
        <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
      </View>
    );
  }

  if (!valid) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.container}>
          <Image source={require('../assets/images/defendulogo.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.title}>Invalid or expired link</Text>
          <Text style={styles.subtitle}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={onInvalidLink}>
            <Text style={styles.buttonText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
        <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <Image source={require('../assets/images/defendulogo.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.title}>Set new password</Text>
          <Text style={styles.subtitle}>Enter your new password below</Text>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="New password (min 8 characters)"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Ionicons
                name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                size={22}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeButton}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                size={22}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Reset Password</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backLink} onPress={onInvalidLink} disabled={loading}>
            <Image source={require('../assets/images/icon-back.png')} style={styles.backIcon} resizeMode="contain" />
            <Text style={styles.backText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
    </KeyboardAvoidingView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#041527' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FFF', marginTop: 12, fontSize: 14 },
  container: { flex: 1, backgroundColor: '#041527', paddingHorizontal: 24, justifyContent: 'center' },
  logoImage: { width: 160, height: 180, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 20, color: '#FFF', fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#FFF', textAlign: 'center', marginBottom: 24 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#01151F',
    borderRadius: 25,
    paddingHorizontal: 15,
    marginBottom: 8,
    height: 56,
  },
  input: { flex: 1, fontSize: 16, height: 56, color: '#FFF', paddingVertical: 0, paddingHorizontal: 4 },
  eyeButton: { padding: 8 },
  errorText: { color: '#FF6B6B', fontSize: 12, marginBottom: 8, textAlign: 'center' },
  button: { backgroundColor: '#00AABB', borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  backLink: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  backIcon: { width: 24, height: 24, marginRight: 8 },
  backText: { color: '#00AABB', fontWeight: '700', fontSize: 14 },
});

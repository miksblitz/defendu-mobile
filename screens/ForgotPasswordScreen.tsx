/**
 * ForgotPasswordScreen
 * Request password reset email. Back to login.
 */
import React, { useState } from 'react';
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
import { AuthController } from '../lib/controllers/AuthController';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

// --- Helpers ---
function validateEmail(email: string): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) return 'Email is required';
  if (email.length > 254) return 'Email is too long (max 254 characters)';
  if (!emailRegex.test(email)) return 'Please enter a valid email address (e.g., user@domain.com)';
  if (email.toLowerCase() === 'admin@defendu.com') return 'This email is not available for password reset. Please contact support.';
  return '';
}

// --- Types ---
interface ForgotPasswordScreenProps {
  onBackToLogin?: () => void;
}

// --- Component ---
export default function ForgotPasswordScreen({ onBackToLogin }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();

  const handleEmailBlur = () => {
    setError(validateEmail(email));
  };

  const handleSend = async () => {
    const validationError = validateEmail(email);
    setError(validationError);
    setSubmitError('');

    if (validationError) {
      showToast(validationError);
      return;
    }

    if (email.toLowerCase() === 'admin@defendu.com') {
      showToast('This email is not available for password reset. Please contact support.');
      return;
    }

    setLoading(true);
    try {
      await AuthController.forgotPassword({ email });
      setSubmitError('');
      showToast('Password reset email sent! Please check your inbox.');
      setTimeout(() => {
        onBackToLogin?.();
      }, 2000);
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Failed to send reset email. Please try again.';
      setSubmitError(msg);
      showToast(msg);
      console.error('[ForgotPassword]', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Image
            source={require('../assets/images/defendulogo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />

          <Text style={styles.title}>Forgot your password?</Text>
          <Text style={styles.subtitle}>We'll send a reset link to your email</Text>

          <View style={styles.inputWrapper}>
            <Image
              source={require('../assets/images/emailicon.png')}
              style={styles.iconImage}
              resizeMode="contain"
            />
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={email}
              keyboardType="email-address"
              onChangeText={(text) => {
                setEmail(text);
                if (error) setError('');
                if (submitError) setSubmitError('');
              }}
              onBlur={handleEmailBlur}
              autoCapitalize="none"
              maxLength={254}
              editable={!loading}
            />
          </View>
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            activeOpacity={0.8}
            onPress={handleSend}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>

          {submitError ? (
            <View style={styles.submitErrorContainer}>
              <Text style={styles.submitErrorLabel}>Error (for debugging):</Text>
              <Text style={styles.submitErrorText} selectable>{submitError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.backLink}
            onPress={onBackToLogin}
            disabled={loading}
          >
            <Image source={require('../assets/images/icon-back.png')} style={styles.backIcon} resizeMode="contain" />
            <Text style={styles.backText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Toast
        message={toastMessage}
        visible={toastVisible}
        onHide={hideToast}
        duration={3000}
      />
    </KeyboardAvoidingView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#041527',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  container: {
    flex: 1,
    backgroundColor: '#041527',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoImage: {
    width: 160,
    height: 180,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    color: '#FFF',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#01151F',
    borderRadius: 25,
    paddingHorizontal: 15,
    marginBottom: 8,
    height: 56,
  },
  iconImage: {
    width: 20,
    height: 20,
    marginRight: 10,
    tintColor: '#FFF',
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: 56,
    color: '#FFF',
    paddingVertical: 0,
    paddingHorizontal: 4,
  },
  errorContainer: {
    marginTop: -4,
    marginBottom: 16,
    paddingLeft: 4,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
  },
  submitErrorContainer: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 100, 100, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  submitErrorLabel: {
    color: '#FFAAAA',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  submitErrorText: {
    color: '#FFCCCC',
    fontSize: 12,
  },
  button: {
    backgroundColor: '#00AABB',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  backIcon: { width: 24, height: 24, marginRight: 8 },
  backText: {
    color: '#00AABB',
    fontWeight: '700',
    fontSize: 14,
  },
});

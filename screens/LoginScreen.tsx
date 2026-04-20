/**
 * LoginScreen
 * Email/password login, forgot password link, register link.
 */
import { useState } from 'react';
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
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { AuthController } from '../lib/controllers/AuthController';
import type { User } from '../lib/models/User';

// --- Types ---
interface LoginScreenProps {
  onForgotPassword?: () => void;
  onRegister?: () => void;
  onLoginSuccess?: (user: User) => void;
}

// --- Component ---
export default function LoginScreen({ onForgotPassword, onRegister, onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();

  const handleLogin = async () => {
    if (!email || !password) {
      showToast('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const user = await AuthController.login({ email, password });
      if (onLoginSuccess) {
        onLoginSuccess(user);
      } else {
        showToast('Login successful');
      }
    } catch (error) {
      const msg = (error as Error)?.message?.trim() || 'Could not sign you in. Please try again.';
      showToast(msg);
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

          <Text style={styles.title}>Welcome Back!</Text>
          <Text style={styles.subtitle}>
            Your skills are waiting. Let's continue your training.
          </Text>

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
              onChangeText={setEmail}
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Image
              source={require('../assets/images/passwordicon.png')}
              style={styles.iconImage}
              resizeMode="contain"
            />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={password}
              secureTextEntry={!showPassword}
              onChangeText={setPassword}
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
                style={styles.eyeIcon}
              />
            </TouchableOpacity>
          </View>

          {(onForgotPassword && (
            <View style={styles.forgotPasswordContainer}>
              <TouchableOpacity onPress={onForgotPassword} disabled={loading}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>
          )) || null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            activeOpacity={0.8}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>Don't Have an Account? </Text>
            <TouchableOpacity onPress={onRegister} disabled={loading}>
              <Text style={styles.linkText}>Create an Account</Text>
            </TouchableOpacity>
          </View>
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
    fontSize: 24,
    fontWeight: '700',
    color: '#FFF',
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
    borderWidth: 1,
    borderColor: '#00AABB',
    borderRadius: 25,
    paddingHorizontal: 15,
    marginBottom: 16,
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
  eyeButton: {
    marginLeft: 8,
    padding: 4,
  },
  eyeIcon: {},
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    color: '#00AABB',
    fontWeight: '600',
    fontSize: 14,
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
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  bottomText: {
    color: '#FFF',
    fontSize: 14,
  },
  linkText: {
    color: '#00AABB',
    fontWeight: '700',
    fontSize: 14,
  },
});

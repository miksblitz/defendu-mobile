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
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { AuthController } from '../lib/controllers/AuthController';
import type { User } from '../lib/models/User';

function getLoginToastMessage(rawMessage: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') return 'Login failed. Please try again.';
  const msg = rawMessage.toLowerCase();
  if (msg.includes('user not found') || msg.includes('no account found')) return 'No account found with this email. Please check your email or create an account.';
  if (msg.includes('wrong password') || msg.includes('incorrect password')) return 'Incorrect password. Please try again.';
  if (msg.includes('invalid') && (msg.includes('credential') || msg.includes('email'))) return 'Please enter a valid email address.';
  if (msg.includes('invalid email or password') || msg.includes('invalid credentials')) return 'Invalid email or password. Please check your details and try again.';
  if (msg.includes('network') || msg.includes('connection') || msg.includes('fetch')) return 'Connection error. Please check your internet and try again.';
  if (msg.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
  if (msg.includes('blocked')) return 'This account has been blocked. Please contact support.';
  if (msg.includes('permission') || msg.includes('auth/')) return 'Something went wrong. Please try again later.';
  return 'Invalid email or password. Please check your details and try again.';
}

interface LoginScreenProps {
  onForgotPassword?: () => void;
  onRegister?: () => void;
  onLoginSuccess?: (user: User) => void;
}

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
      const raw = (error as Error)?.message ?? '';
      const msg = getLoginToastMessage(raw);
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
              <Image
                source={require('../assets/images/showpasswordicon.png')}
                style={styles.eyeIcon}
                resizeMode="contain"
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
  eyeIcon: {
    width: 20,
    height: 20,
    tintColor: '#FFF',
  },
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

/**
 * RegisterScreen
 * New user registration: name, email, password, confirm password.
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
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { AuthController } from '../lib/controllers/AuthController';
import type { User } from '../lib/models/User';

// --- Validation helpers ---
function validateName(name: string, fieldName: string): string {
  if (!name) return `${fieldName} is required`;
  if (name.length < 2) return `${fieldName} must be at least 2 characters long`;
  if (name.length > 50) return `${fieldName} is too long (max 50 characters)`;
  const nameRegex = /^[a-zA-Z\s'-]+$/;
  if (!nameRegex.test(name)) return `${fieldName} can only contain letters, spaces, hyphens, and apostrophes`;
  return '';
}

function validateEmail(email: string): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) return 'Email is required';
  if (email.length > 254) return 'Email is too long (max 254 characters)';
  if (!emailRegex.test(email)) return 'Please enter a valid email address (e.g., user@domain.com)';
  if (email.toLowerCase() === 'admin@defendu.com') return 'This email is not allowed. Please try a different one.';
  return '';
}

function validatePassword(password: string): string {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (password.length > 128) return 'Password is too long (max 128 characters)';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return 'Password must contain at least one special character';
  return '';
}

function validateConfirmPassword(confirmPassword: string, password: string): string {
  if (!confirmPassword) return 'Please confirm your password';
  if (confirmPassword !== password) return 'Passwords do not match';
  return '';
}

// --- Types ---
interface FormState {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface ErrorsState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface RegisterScreenProps {
  onLogin?: () => void;
  onRegisterSuccess?: (user: User) => void;
}

// --- Component ---
export default function RegisterScreen({ onLogin, onRegisterSuccess }: RegisterScreenProps) {
  const [form, setForm] = useState<FormState>({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<ErrorsState>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();

  const handleFirstNameBlur = () => {
    setErrors((prev) => ({ ...prev, firstName: validateName(form.firstName, 'First name') }));
  };
  const handleLastNameBlur = () => {
    setErrors((prev) => ({ ...prev, lastName: validateName(form.lastName, 'Last name') }));
  };
  const handleEmailBlur = () => {
    setErrors((prev) => ({ ...prev, email: validateEmail(form.email) }));
  };
  const handlePasswordBlur = () => {
    setErrors((prev) => ({ ...prev, password: validatePassword(form.password) }));
  };
  const handleConfirmPasswordBlur = () => {
    setErrors((prev) => ({ ...prev, confirmPassword: validateConfirmPassword(form.confirmPassword, form.password) }));
  };

  const handleCreateAccount = async () => {
    const firstNameError = validateName(form.firstName, 'First name');
    const lastNameError = validateName(form.lastName, 'Last name');
    const emailError = validateEmail(form.email);
    const passwordError = validatePassword(form.password);
    const confirmPasswordError = validateConfirmPassword(form.confirmPassword, form.password);

    setErrors({
      firstName: firstNameError,
      lastName: lastNameError,
      email: emailError,
      password: passwordError,
      confirmPassword: confirmPasswordError,
    });

    if (firstNameError || lastNameError || emailError || passwordError || confirmPasswordError) {
      showToast('Please fix the errors before submitting');
      return;
    }
    if (form.email.toLowerCase() === 'admin@defendu.com') {
      setErrors((prev) => ({ ...prev, email: 'This email is not allowed. Please try a different one.' }));
      showToast('This email is not allowed. Please try a different one.');
      return;
    }
    if (!form.username.trim()) {
      showToast('Please enter a username');
      return;
    }

    setLoading(true);
    try {
      const user = await AuthController.register({
        email: form.email,
        password: form.password,
        username: form.username.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      });
      showToast('Account created successfully! Please complete your skill profile.');
      setTimeout(() => {
        setLoading(false);
        onRegisterSuccess?.(user);
      }, 2000);
    } catch (error) {
      showToast((error as Error)?.message ?? 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  const nameFieldIcon = require('../assets/images/emailicon.png');
  const emailIcon = require('../assets/images/emailicon.png');
  const passwordIcon = require('../assets/images/passwordicon.png');
  const showPasswordIcon = require('../assets/images/showpasswordicon.png');

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
          <Text style={styles.title}>Empower your safety.</Text>
          <Text style={styles.subtitle}>
            Create your account and start building lifesaving skills today.
          </Text>

          <View style={styles.inputWrapper}>
            <Image source={nameFieldIcon} style={styles.iconImage} resizeMode="contain" />
            <TextInput
              style={styles.input}
              placeholder="Enter your username"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={form.username}
              onChangeText={(text) => setForm((f) => ({ ...f, username: text }))}
              autoCapitalize="none"
              maxLength={50}
              editable={!loading}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Image source={nameFieldIcon} style={styles.iconImage} resizeMode="contain" />
            <TextInput
              style={styles.input}
              placeholder="Enter your First Name"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={form.firstName}
              onChangeText={(text) => {
                setForm((f) => ({ ...f, firstName: text }));
                if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: '' }));
              }}
              onBlur={handleFirstNameBlur}
              maxLength={50}
              editable={!loading}
            />
          </View>
          {errors.firstName ? <Text style={styles.errorText}>{errors.firstName}</Text> : null}

          <View style={styles.inputWrapper}>
            <Image source={nameFieldIcon} style={styles.iconImage} resizeMode="contain" />
            <TextInput
              style={styles.input}
              placeholder="Enter your Last Name"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={form.lastName}
              onChangeText={(text) => {
                setForm((f) => ({ ...f, lastName: text }));
                if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: '' }));
              }}
              onBlur={handleLastNameBlur}
              maxLength={50}
              editable={!loading}
            />
          </View>
          {errors.lastName ? <Text style={styles.errorText}>{errors.lastName}</Text> : null}

          <View style={styles.inputWrapper}>
            <Image source={emailIcon} style={styles.iconImage} resizeMode="contain" />
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={form.email}
              onChangeText={(text) => {
                setForm((f) => ({ ...f, email: text }));
                if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
              }}
              onBlur={handleEmailBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={254}
              editable={!loading}
            />
          </View>
          {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

          <View style={styles.inputWrapper}>
            <Image source={passwordIcon} style={styles.iconImage} resizeMode="contain" />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={form.password}
              secureTextEntry={!showPass}
              onChangeText={(text) => {
                setForm((f) => ({ ...f, password: text }));
                if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
              }}
              onBlur={handlePasswordBlur}
              maxLength={128}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPass(!showPass)}
              style={styles.eyeButton}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Image source={showPasswordIcon} style={styles.eyeIcon} resizeMode="contain" />
            </TouchableOpacity>
          </View>
          {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

          <View style={styles.inputWrapper}>
            <Image source={passwordIcon} style={styles.iconImage} resizeMode="contain" />
            <TextInput
              style={styles.input}
              placeholder="Re-type your password"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={form.confirmPassword}
              secureTextEntry={!showConfirmPass}
              onChangeText={(text) => {
                setForm((f) => ({ ...f, confirmPassword: text }));
                if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }));
              }}
              onBlur={handleConfirmPasswordBlur}
              maxLength={128}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPass(!showConfirmPass)}
              style={styles.eyeButton}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Image source={showPasswordIcon} style={styles.eyeIcon} resizeMode="contain" />
            </TouchableOpacity>
          </View>
          {errors.confirmPassword ? <Text style={styles.errorText}>{errors.confirmPassword}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            activeOpacity={0.8}
            onPress={handleCreateAccount}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>Already have an Account? </Text>
            <TouchableOpacity onPress={onLogin} disabled={loading}>
              <Text style={styles.linkText}>Log In</Text>
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
  wrapper: { flex: 1, backgroundColor: '#041527' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 40, alignItems: 'center' },
  container: { width: '100%', maxWidth: 400, alignItems: 'center' },
  logoImage: { width: 160, height: 180, marginBottom: 16, resizeMode: 'contain' },
  title: { fontSize: 24, fontWeight: '700', color: '#FFF', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#FFF', textAlign: 'center', marginBottom: 24 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#01151F',
    borderRadius: 25,
    paddingHorizontal: 15,
    marginBottom: 8,
    height: 56,
    width: '100%',
  },
  iconImage: { width: 20, height: 20, marginRight: 10, tintColor: '#FFF' },
  input: { flex: 1, fontSize: 16, height: 56, color: '#FFF', paddingVertical: 0, paddingHorizontal: 4 },
  eyeButton: { marginLeft: 8, padding: 4 },
  eyeIcon: { width: 20, height: 20, tintColor: '#FFF' },
  errorText: { color: '#FF6B6B', fontSize: 12, marginBottom: 8, marginTop: -4, width: '100%', paddingLeft: 15 },
  button: {
    backgroundColor: '#00AABB',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
    width: '100%',
    maxWidth: 300,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  bottomText: { color: '#FFF', fontSize: 14 },
  linkText: { color: '#00AABB', fontWeight: '700', fontSize: 14 },
});

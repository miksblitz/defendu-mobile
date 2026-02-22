import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import StartupScreen from './screens/StartupScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import DashboardScreen from './screens/DashboardScreen';
import ViewModuleScreen from './screens/ViewModuleScreen';
import ProfileScreen from './screens/ProfileScreen';
import MessagesScreen from './screens/MessagesScreen';
import TrainerScreen from './screens/TrainerScreen';
import TrainerRegistrationScreen from './screens/TrainerRegistrationScreen';
import PublishModuleScreen from './screens/PublishModuleScreen';
import SkillProfilePhysicalScreen from './screens/SkillProfilePhysicalScreen';
import SkillProfilePreferencesScreen from './screens/SkillProfilePreferencesScreen';
import SkillProfilePastExperienceScreen from './screens/SkillProfilePastExperienceScreen';
import SkillProfileFitnessScreen from './screens/SkillProfileFitnessScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import MainLayout from './components/MainLayout';
import { SkillProfileProvider } from './lib/contexts/SkillProfileContext';
import { UnreadMessagesProvider } from './lib/contexts/UnreadMessagesContext';
import { AuthController } from './lib/controllers/AuthController';
import type { User } from './lib/models/User';

type Screen =
  | 'startup'
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'reset-password'
  | 'dashboard'
  | 'view-module'
  | 'profile'
  | 'messages'
  | 'trainer'
  | 'trainer-registration'
  | 'publish-module'
  | 'skill-profile-step1'
  | 'skill-profile-step2'
  | 'skill-profile-step3'
  | 'skill-profile-step4';

const startupOverlayStyle = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

function parseResetPasswordToken(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    // Support both path "resetpassword" and hostname "resetpassword" (platform-dependent)
    const pathOrHost = (parsed.path ?? parsed.hostname ?? '').toLowerCase();
    if (pathOrHost !== 'resetpassword') return null;
    const token = parsed.queryParams?.token;
    if (token && typeof token === 'string') return token;
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('startup');
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(null);
  const [initialUrlChecked, setInitialUrlChecked] = useState(false);
  const [viewModuleId, setViewModuleId] = useState<string | null>(null);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [messagesOpenWith, setMessagesOpenWith] = useState<{ uid: string; name: string; photo: string | null } | null>(null);
  const [isApprovedTrainer, setIsApprovedTrainer] = useState(false);

  useEffect(() => {
    if (screen !== 'trainer') return;
    let cancelled = false;
    AuthController.getCurrentUser().then((user) => {
      if (cancelled) return;
      setIsApprovedTrainer(Boolean(user?.role === 'trainer' && user?.trainerApproved));
    });
    return () => { cancelled = true; };
  }, [screen]);

  // Deep link: defenduapp://resetpassword?token=... (from email reset link → open app → Enter new password)
  useEffect(() => {
    const handleUrl = (url: string) => {
      const token = parseResetPasswordToken(url);
      if (token) {
        setResetPasswordToken(token);
        setScreen('reset-password');
      }
    };

    // Cold start: app opened by tapping link in email – go straight to reset-password, don’t show login
    Linking.getInitialURL().then((url) => {
      const token = parseResetPasswordToken(url);
      if (token) {
        setResetPasswordToken(token);
        setScreen('reset-password');
      }
      setInitialUrlChecked(true);
    });

    // If getInitialURL() never resolves (e.g. some devices), allow startup→login after 3s
    const timeout = setTimeout(() => setInitialUrlChecked(true), 3000);

    // App already open, user taps link again
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => {
      clearTimeout(timeout);
      sub.remove();
    };
  }, []);

  const handleLoginSuccess = (user: User) => {
    if (user.role === 'admin') {
      setScreen('dashboard');
    } else if (!user.hasCompletedSkillProfile) {
      setScreen('skill-profile-step1');
    } else {
      setScreen('dashboard');
    }
  };

  const goToDashboard = () => setScreen('dashboard');
  const handleLogout = () => setScreen('login');

  const handleNav = (screen: 'dashboard' | 'profile' | 'trainer' | 'messages') => {
    if (screen === 'messages') setMessagesOpenWith(null);
    setScreen(screen);
  };

  return (
    <>
      <StatusBar style="light" />
      {(screen === 'startup' || screen === 'login') && (
        <View style={{ flex: 1 }}>
          <LoginScreen
            onForgotPassword={() => setScreen('forgot-password')}
            onRegister={() => setScreen('register')}
            onLoginSuccess={handleLoginSuccess}
          />
          {screen === 'startup' && (
            <View style={startupOverlayStyle} pointerEvents="box-none">
              <StartupScreen
                onFinish={() => {
                  if (initialUrlChecked) setScreen('login');
                }}
              />
            </View>
          )}
        </View>
      )}
      {screen === 'forgot-password' && (
        <ForgotPasswordScreen onBackToLogin={() => setScreen('login')} />
      )}
      {screen === 'reset-password' && resetPasswordToken && (
        <ResetPasswordScreen
          token={resetPasswordToken}
          onSuccess={() => { setResetPasswordToken(null); setScreen('login'); }}
          onInvalidLink={() => { setResetPasswordToken(null); setScreen('login'); }}
        />
      )}
      {screen === 'register' && (
        <RegisterScreen
          onLogin={() => setScreen('login')}
          onRegisterSuccess={(user: User | undefined) => {
            if (user && !user.hasCompletedSkillProfile) setScreen('skill-profile-step1');
            else setScreen('login');
          }}
        />
      )}
      {(screen === 'dashboard' || screen === 'view-module' || screen === 'profile' || screen === 'messages' || screen === 'trainer' || screen === 'trainer-registration' || screen === 'publish-module') && (
        <UnreadMessagesProvider>
          {screen === 'dashboard' && (
            <MainLayout title="" currentScreen="dashboard" onNavigate={handleNav} onLogout={handleLogout}>
              <DashboardScreen
                refreshKey={dashboardRefreshKey}
                onOpenModule={(moduleId) => { setViewModuleId(moduleId); setScreen('view-module'); }}
              />
            </MainLayout>
          )}
          {screen === 'view-module' && viewModuleId && (
            <MainLayout title="" currentScreen="dashboard" onNavigate={handleNav} onLogout={handleLogout}>
              <ViewModuleScreen
                moduleId={viewModuleId}
                onBack={() => {
                  setViewModuleId(null);
                  setScreen('dashboard');
                  setDashboardRefreshKey((k) => k + 1);
                }}
              />
            </MainLayout>
          )}
          {screen === 'profile' && (
            <MainLayout title="Profile" currentScreen="profile" onNavigate={handleNav} onLogout={handleLogout}>
              <ProfileScreen />
            </MainLayout>
          )}
          {screen === 'messages' && (
            <MainLayout title="Messages" currentScreen="messages" onNavigate={handleNav} onLogout={handleLogout}>
              <MessagesScreen
                openWithUserId={messagesOpenWith?.uid}
                openWithUserName={messagesOpenWith?.name}
                openWithUserPhoto={messagesOpenWith?.photo ?? undefined}
              />
            </MainLayout>
          )}
          {screen === 'trainer' && (
            <MainLayout
              title="Trainers"
              currentScreen="trainer"
              onNavigate={handleNav}
              onLogout={handleLogout}
              headerRight={
                isApprovedTrainer ? (
                  <TouchableOpacity
                    style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#07bbc0', borderRadius: 8 }}
                    onPress={() => setScreen('publish-module')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#041527', fontSize: 14, fontWeight: '700' }}>Publish</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#07bbc0', borderRadius: 8 }}
                    onPress={() => setScreen('trainer-registration')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#041527', fontSize: 14, fontWeight: '700' }}>Register</Text>
                  </TouchableOpacity>
                )
              }
            >
              <TrainerScreen onMessageTrainer={(uid, name, photo) => { setMessagesOpenWith({ uid, name, photo }); setScreen('messages'); }} />
            </MainLayout>
          )}
          {screen === 'trainer-registration' && (
            <TrainerRegistrationScreen
              onBack={() => setScreen('trainer')}
              onSuccess={() => setScreen('dashboard')}
            />
          )}
          {screen === 'publish-module' && (
            <PublishModuleScreen
              onBack={() => setScreen('trainer')}
              onSuccess={() => setScreen('dashboard')}
            />
          )}
        </UnreadMessagesProvider>
      )}
      {(screen === 'skill-profile-step1' || screen === 'skill-profile-step2' || screen === 'skill-profile-step3' || screen === 'skill-profile-step4') && (
        <SkillProfileProvider>
          {screen === 'skill-profile-step1' && (
            <SkillProfilePhysicalScreen
              onNext={() => setScreen('skill-profile-step2')}
              onBack={handleLogout}
            />
          )}
          {screen === 'skill-profile-step2' && (
            <SkillProfilePreferencesScreen
              onNext={() => setScreen('skill-profile-step3')}
              onBack={() => setScreen('skill-profile-step1')}
            />
          )}
          {screen === 'skill-profile-step3' && (
            <SkillProfilePastExperienceScreen
              onNext={() => setScreen('skill-profile-step4')}
              onBack={() => setScreen('skill-profile-step2')}
            />
          )}
          {screen === 'skill-profile-step4' && (
            <SkillProfileFitnessScreen
              onComplete={goToDashboard}
              onBack={() => setScreen('skill-profile-step3')}
              onSessionExpired={() => setScreen('login')}
            />
          )}
        </SkillProfileProvider>
      )}
    </>
  );
}

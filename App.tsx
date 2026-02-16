import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import StartupScreen from './screens/StartupScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import DashboardScreen from './screens/DashboardScreen';
import ViewModuleScreen from './screens/ViewModuleScreen';
import ProfileScreen from './screens/ProfileScreen';
import MessagesScreen from './screens/MessagesScreen';
import TrainerScreen from './screens/TrainerScreen';
import SkillProfilePhysicalScreen from './screens/SkillProfilePhysicalScreen';
import SkillProfilePreferencesScreen from './screens/SkillProfilePreferencesScreen';
import SkillProfilePastExperienceScreen from './screens/SkillProfilePastExperienceScreen';
import SkillProfileFitnessScreen from './screens/SkillProfileFitnessScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import MainLayout from './components/MainLayout';
import { SkillProfileProvider } from './lib/contexts/SkillProfileContext';
import { UnreadMessagesProvider } from './lib/contexts/UnreadMessagesContext';
import type { User } from './lib/models/User';

type Screen =
  | 'startup'
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'dashboard'
  | 'view-module'
  | 'profile'
  | 'messages'
  | 'trainer'
  | 'skill-profile-step1'
  | 'skill-profile-step2'
  | 'skill-profile-step3'
  | 'skill-profile-step4';

export default function App() {
  const [screen, setScreen] = useState<Screen>('startup');
  const [viewModuleId, setViewModuleId] = useState<string | null>(null);
  const [messagesOpenWith, setMessagesOpenWith] = useState<{ uid: string; name: string; photo: string | null } | null>(null);

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
      {screen === 'startup' && (
        <StartupScreen onFinish={() => setScreen('login')} />
      )}
      {screen === 'login' && (
        <LoginScreen
          onForgotPassword={() => setScreen('forgot-password')}
          onRegister={() => setScreen('register')}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
      {screen === 'forgot-password' && (
        <ForgotPasswordScreen onBackToLogin={() => setScreen('login')} />
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
      {(screen === 'dashboard' || screen === 'view-module' || screen === 'profile' || screen === 'messages' || screen === 'trainer') && (
        <UnreadMessagesProvider>
          {screen === 'dashboard' && (
            <MainLayout title="Dashboard" currentScreen="dashboard" onNavigate={handleNav} onLogout={handleLogout}>
              <DashboardScreen onOpenModule={(moduleId) => { setViewModuleId(moduleId); setScreen('view-module'); }} />
            </MainLayout>
          )}
          {screen === 'view-module' && viewModuleId && (
            <MainLayout title="Module" currentScreen="dashboard" onNavigate={handleNav} onLogout={handleLogout}>
              <ViewModuleScreen moduleId={viewModuleId} onBack={() => { setViewModuleId(null); setScreen('dashboard'); }} />
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
            <MainLayout title="Trainers" currentScreen="trainer" onNavigate={handleNav} onLogout={handleLogout}>
              <TrainerScreen onMessageTrainer={(uid, name, photo) => { setMessagesOpenWith({ uid, name, photo }); setScreen('messages'); }} />
            </MainLayout>
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
            />
          )}
        </SkillProfileProvider>
      )}
    </>
  );
}

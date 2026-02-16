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
            <DashboardScreen
              onLogout={handleLogout}
              onOpenMessages={() => { setMessagesOpenWith(null); setScreen('messages'); }}
              onOpenProfile={() => setScreen('profile')}
              onOpenTrainers={() => setScreen('trainer')}
              onOpenModule={(moduleId) => { setViewModuleId(moduleId); setScreen('view-module'); }}
            />
          )}
          {screen === 'view-module' && viewModuleId && (
            <ViewModuleScreen moduleId={viewModuleId} onBack={() => { setViewModuleId(null); setScreen('dashboard'); }} />
          )}
          {screen === 'profile' && (
            <ProfileScreen onBack={goToDashboard} />
          )}
          {screen === 'messages' && (
            <MessagesScreen
              onBack={goToDashboard}
              openWithUserId={messagesOpenWith?.uid}
              openWithUserName={messagesOpenWith?.name}
              openWithUserPhoto={messagesOpenWith?.photo ?? undefined}
            />
          )}
          {screen === 'trainer' && (
            <TrainerScreen
              onBack={goToDashboard}
              onMessageTrainer={(uid, name, photo) => { setMessagesOpenWith({ uid, name, photo }); setScreen('messages'); }}
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
            />
          )}
        </SkillProfileProvider>
      )}
    </>
  );
}

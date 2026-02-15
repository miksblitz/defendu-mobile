import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import StartupScreen from './screens/StartupScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import DashboardScreen from './screens/DashboardScreen';
import SkillProfilePhysicalScreen from './screens/SkillProfilePhysicalScreen';
import SkillProfilePreferencesScreen from './screens/SkillProfilePreferencesScreen';
import SkillProfilePastExperienceScreen from './screens/SkillProfilePastExperienceScreen';
import SkillProfileFitnessScreen from './screens/SkillProfileFitnessScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import { SkillProfileProvider } from './lib/contexts/SkillProfileContext';

export default function App() {
  const [screen, setScreen] = useState('startup');

  const handleLoginSuccess = (user) => {
    if (user.role === 'admin') {
      setScreen('dashboard'); // mobile: no separate admin dashboard yet
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
          onRegisterSuccess={(user) => {
            if (user && !user.hasCompletedSkillProfile) setScreen('skill-profile-step1');
            else setScreen('login');
          }}
        />
      )}
      {screen === 'dashboard' && (
        <DashboardScreen onLogout={handleLogout} />
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

import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import StartupScreen from './screens/StartupScreen';
import LoginScreen from './screens/LoginScreen';

export default function App() {
  const [screen, setScreen] = useState('startup');

  return (
    <>
      <StatusBar style="light" />
      {screen === 'startup' && (
        <StartupScreen onFinish={() => setScreen('login')} />
      )}
      {screen === 'login' && (
        <LoginScreen
          onForgotPassword={() => {}}
          onRegister={() => {}}
          onLoginSuccess={() => {}}
        />
      )}
    </>
  );
}

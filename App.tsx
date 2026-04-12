import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator, StyleSheet, Image, LogBox } from 'react-native';

// Suppress "Open debugger to view warnings" and similar dev prompts
LogBox.ignoreLogs(['Open debugger', 'view warnings', 'Debugger']);
import StartupScreen from './screens/StartupScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import RegisterOtpScreen from './screens/RegisterOtpScreen';
import DashboardScreen from './screens/DashboardScreen';
import ViewModuleScreen from './screens/ViewModuleScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import MessagesScreen from './screens/MessagesScreen';
import TrainerScreen from './screens/TrainerScreen';
import TrainerRegistrationScreen from './screens/TrainerRegistrationScreen';
import PublishModuleScreen from './screens/PublishModuleScreen';
import CategoryPracticeSessionScreen from './screens/CategoryPracticeSessionScreen';
import TopUpScreen from './screens/TopUpScreen';
import TopUpInvoiceScreen from './screens/TopUpInvoiceScreen';
import type { TopUpInvoice } from './lib/controllers/payments';
import ModulePurchaseInvoiceScreen from './screens/ModulePurchaseInvoiceScreen';
import type { ModulePurchaseInvoice } from './lib/controllers/modulePurchases';
import SkillProfilePhysicalScreen from './screens/SkillProfilePhysicalScreen';
import SkillProfilePreferencesScreen from './screens/SkillProfilePreferencesScreen';
import SkillProfilePastExperienceScreen from './screens/SkillProfilePastExperienceScreen';
import SkillProfileFitnessScreen from './screens/SkillProfileFitnessScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import MainLayout from './components/MainLayout';
import { SkillProfileProvider } from './lib/contexts/SkillProfileContext';
import { UnreadMessagesProvider } from './lib/contexts/UnreadMessagesContext';
import { PoseSkeletonProvider } from './lib/contexts/PoseSkeletonContext';
import { AuthController, type ModuleItem } from './lib/controllers/AuthController';
import type { RegisterData, User } from './lib/models/User';

type Screen =
  | 'splash'
  | 'startup'
  | 'login'
  | 'register'
  | 'register-otp'
  | 'forgot-password'
  | 'reset-password'
  | 'dashboard'
  | 'view-module'
  | 'profile'
  | 'settings'
  | 'messages'
  | 'trainer'
  | 'trainer-registration'
  | 'publish-module'
  | 'top-up'
  | 'top-up-invoice'
  | 'module-purchase-invoice'
  | 'category-practice-session'
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
  const [screen, setScreen] = useState<Screen>('splash');
  const [topUpStep, setTopUpStep] = useState<'packs' | 'payment'>('packs');
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [topUpReceipt, setTopUpReceipt] = useState<{ invoice: TopUpInvoice; newCredits: number } | null>(null);
  const [modulePurchaseReceipt, setModulePurchaseReceipt] = useState<{ invoice: ModulePurchaseInvoice; newCredits: number } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(null);
  const [initialUrlChecked, setInitialUrlChecked] = useState(false);
  const [viewModuleId, setViewModuleId] = useState<string | null>(null);
  const [viewModuleInitial, setViewModuleInitial] = useState<ModuleItem | null>(null);
  const [categoryPracticeSession, setCategoryPracticeSession] = useState<{
    category: string;
    warmups: string[];
    cooldowns: string[];
    trainingModules: ModuleItem[];
    startPhase?: 'warmup' | 'cooldown';
    mannequinGifUri?: string | null;
    sessionVariant?: 'default' | 'recommendedSingle';
    returnToCategoryAfterExit?: boolean;
  } | null>(null);
  const [dashboardRecommendationsReopenToken, setDashboardRecommendationsReopenToken] = useState(0);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [dashboardReturnToCategory, setDashboardReturnToCategory] = useState<string | null>(null);
  const [dashboardToastMessage, setDashboardToastMessage] = useState<string | null>(null);
  const [messagesOpenWith, setMessagesOpenWith] = useState<{ uid: string; name: string; photo: string | null } | null>(null);
  const [isApprovedTrainer, setIsApprovedTrainer] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<RegisterData | null>(null);

  // Splash: brief branding then startup (shorter = faster to interactive)
  useEffect(() => {
    if (screen !== 'splash') return;
    const t = setTimeout(() => setScreen('startup'), 1200);
    return () => clearTimeout(t);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'trainer' && screen !== 'dashboard') return;
    let cancelled = false;
    AuthController.getCurrentUser().then((user) => {
      if (cancelled) return;
      setIsApprovedTrainer(Boolean(user?.role === 'trainer' && user?.trainerApproved));
    });
    return () => { cancelled = true; };
  }, [screen]);

  useEffect(() => {
    if (screen === 'splash' || screen === 'startup' || screen === 'login' || screen === 'register' || screen === 'register-otp' || screen === 'forgot-password' || screen === 'reset-password') {
      return;
    }
    let cancelled = false;
    AuthController.getCurrentUser().then((user) => {
      if (cancelled) return;
      setCreditsBalance(typeof user?.credits === 'number' ? user.credits : 0);
    }).catch(() => {
      if (!cancelled) setCreditsBalance(0);
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
    setCreditsBalance(typeof user.credits === 'number' ? user.credits : 0);
    if (user.role === 'admin') {
      setScreen('dashboard');
    } else if (!user.hasCompletedSkillProfile) {
      setScreen('skill-profile-step1');
    } else {
      setScreen('dashboard');
    }
  };

  const goToDashboard = () => setScreen('dashboard');
  const handleLogout = () => setLoggingOut(true);

  useEffect(() => {
    if (!loggingOut) return;
    const t = setTimeout(() => {
      setScreen('login');
      setLoggingOut(false);
    }, 800);
    return () => clearTimeout(t);
  }, [loggingOut]);

  const handleNav = (screen: 'dashboard' | 'profile' | 'trainer' | 'messages' | 'settings') => {
    if (screen === 'messages') setMessagesOpenWith(null);
    setScreen(screen);
  };

  const openTopUp = useCallback(() => {
    setTopUpReceipt(null);
    setTopUpStep('packs');
    setScreen('top-up');
  }, []);

  /** Clears reopen signal after Dashboard handles it (avoids modal opening again after unrelated remounts). */
  const handleConsumeRecommendationsReopen = useCallback(() => {
    setDashboardRecommendationsReopenToken(0);
  }, []);

  return (
    <>
      <StatusBar style="light" />
      {screen === 'splash' && (
        <View style={splashStyles.container}>
          <Image
            source={require('./assets/images/defendudashboardlogo.png')}
            style={splashStyles.logo}
            resizeMode="contain"
          />
        </View>
      )}
      {loggingOut && (
        <View style={logoutOverlayStyles.overlay}>
          <ActivityIndicator size="large" color="#00AABB" />
          <Text style={logoutOverlayStyles.text}>Logging out...</Text>
        </View>
      )}
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
          onOtpRequested={(data) => {
            setPendingRegistration(data);
            setScreen('register-otp');
          }}
          onRegistered={() => {
            setPendingRegistration(null);
            setScreen('login');
          }}
        />
      )}
      {screen === 'register-otp' && pendingRegistration && (
        <RegisterOtpScreen
          registrationData={pendingRegistration}
          onBack={() => setScreen('register')}
          onSuccess={() => {
            setPendingRegistration(null);
            setScreen('login');
          }}
        />
      )}
      {screen === 'register-otp' && !pendingRegistration && (
        <LoginScreen
          onForgotPassword={() => setScreen('forgot-password')}
          onRegister={() => setScreen('register')}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
      {(screen === 'dashboard' || screen === 'view-module' || screen === 'profile' || screen === 'settings' || screen === 'messages' || screen === 'trainer' || screen === 'trainer-registration' || screen === 'publish-module' || screen === 'category-practice-session' || screen === 'top-up' || screen === 'top-up-invoice' || screen === 'module-purchase-invoice') && (
        <PoseSkeletonProvider>
        <UnreadMessagesProvider>
          {screen === 'dashboard' && (
            <MainLayout
              title=""
              currentScreen="dashboard"
              onNavigate={handleNav}
              onLogout={handleLogout}
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
              headerRight={
                !isApprovedTrainer ? (
                  <TouchableOpacity
                    style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#07bbc0', borderRadius: 8 }}
                    onPress={() => setScreen('trainer-registration')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#041527', fontSize: 14, fontWeight: '700' }}>Apply as Trainer</Text>
                  </TouchableOpacity>
                ) : undefined
              }
            >
              <DashboardScreen
                refreshKey={dashboardRefreshKey}
                recommendationsReopenToken={dashboardRecommendationsReopenToken}
                onConsumeRecommendationsReopen={handleConsumeRecommendationsReopen}
                returnToCategory={dashboardReturnToCategory}
                onConsumeReturnToCategory={() => setDashboardReturnToCategory(null)}
                initialToastMessage={dashboardToastMessage}
                onClearInitialToast={() => setDashboardToastMessage(null)}
                onModulePurchaseComplete={(payload) => {
                  setCreditsBalance(payload.newCredits);
                  setModulePurchaseReceipt(payload);
                  setScreen('module-purchase-invoice');
                }}
                onOpenModule={(moduleId: string, initialModule?: ModuleItem) => { setViewModuleId(moduleId); setViewModuleInitial(initialModule ?? null); setScreen('view-module'); }}
                onStartCategorySession={(payload) => {
                  setCategoryPracticeSession(payload);
                  setScreen('category-practice-session');
                }}
                onStartRecommendedSingleSession={(mod) => {
                  const cat = mod.category?.trim() ? mod.category : 'Punching';
                  setCategoryPracticeSession({
                    category: cat,
                    warmups: [],
                    cooldowns: [],
                    trainingModules: [mod],
                    sessionVariant: 'recommendedSingle',
                  });
                  setScreen('category-practice-session');
                }}
              />
            </MainLayout>
          )}
          {screen === 'view-module' && viewModuleId && (
            <MainLayout
              title=""
              currentScreen="dashboard"
              onNavigate={handleNav}
              onLogout={handleLogout}
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
            >
              <ViewModuleScreen
                moduleId={viewModuleId}
                initialModule={viewModuleInitial}
                onBack={() => {
                  setViewModuleId(null);
                  setViewModuleInitial(null);
                  setScreen('dashboard');
                  setDashboardRefreshKey((k) => k + 1);
                }}
              />
            </MainLayout>
          )}
          {screen === 'profile' && (
            <MainLayout
              title="Profile"
              currentScreen="profile"
              onNavigate={handleNav}
              onLogout={handleLogout}
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
            >
              <ProfileScreen />
            </MainLayout>
          )}
          {screen === 'settings' && (
            <MainLayout
              title="Settings"
              currentScreen="settings"
              onNavigate={handleNav}
              onLogout={handleLogout}
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
            >
              <SettingsScreen />
            </MainLayout>
          )}
          {screen === 'messages' && (
            <MainLayout
              title="Messages"
              currentScreen="messages"
              onNavigate={handleNav}
              onLogout={handleLogout}
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
            >
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
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
              headerRight={
                isApprovedTrainer ? (
                  <TouchableOpacity
                    style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#07bbc0', borderRadius: 8 }}
                    onPress={() => setScreen('publish-module')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#041527', fontSize: 14, fontWeight: '700' }}>Publish</Text>
                  </TouchableOpacity>
                ) : undefined
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
              onSuccess={(toastMessage) => {
                if (toastMessage) setDashboardToastMessage(toastMessage);
                setScreen('dashboard');
              }}
            />
          )}
          {screen === 'category-practice-session' && categoryPracticeSession && (
            <MainLayout
              title=""
              currentScreen="dashboard"
              onNavigate={handleNav}
              onLogout={handleLogout}
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
              hideNavButton
              hideCreditsBar
            >
              <CategoryPracticeSessionScreen
                category={categoryPracticeSession.category}
                warmups={categoryPracticeSession.warmups}
                cooldowns={categoryPracticeSession.cooldowns}
                trainingModules={categoryPracticeSession.trainingModules}
                startPhase={categoryPracticeSession.startPhase}
                mannequinGifUri={categoryPracticeSession.mannequinGifUri ?? null}
                sessionVariant={categoryPracticeSession.sessionVariant ?? 'default'}
                onExit={() => {
                  const variant = categoryPracticeSession.sessionVariant;
                  if (variant === 'recommendedSingle') {
                    setDashboardRecommendationsReopenToken((t) => t + 1);
                  } else {
                    setDashboardRecommendationsReopenToken(0);
                    if (categoryPracticeSession.returnToCategoryAfterExit !== false) {
                      setDashboardReturnToCategory(categoryPracticeSession.category);
                    }
                  }
                  setCategoryPracticeSession(null);
                  setScreen('dashboard');
                  setDashboardRefreshKey((k) => k + 1);
                }}
              />
            </MainLayout>
          )}
          {screen === 'top-up' && (
            <MainLayout
              title="Top Up"
              currentScreen="dashboard"
              onNavigate={handleNav}
              onLogout={handleLogout}
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
              headerLeft="back"
              onHeaderBack={() => {
                if (topUpStep === 'payment') {
                  setTopUpStep('packs');
                } else {
                  setScreen('dashboard');
                }
              }}
            >
              <TopUpScreen
                step={topUpStep}
                onStepChange={setTopUpStep}
                onCreditsUpdated={setCreditsBalance}
                onPaymentComplete={(payload) => {
                  setTopUpReceipt(payload);
                  setScreen('top-up-invoice');
                }}
              />
            </MainLayout>
          )}
          {screen === 'top-up-invoice' && topUpReceipt && (
            <MainLayout
              title=""
              currentScreen="dashboard"
              onNavigate={handleNav}
              onLogout={handleLogout}
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
              headerLeft="back"
              onHeaderBack={() => {
                setTopUpReceipt(null);
                setTopUpStep('packs');
                setScreen('dashboard');
              }}
            >
              <TopUpInvoiceScreen
                invoice={topUpReceipt.invoice}
                newCredits={topUpReceipt.newCredits}
                onDone={() => {
                  setTopUpReceipt(null);
                  setTopUpStep('packs');
                  setScreen('dashboard');
                }}
              />
            </MainLayout>
          )}
          {screen === 'module-purchase-invoice' && modulePurchaseReceipt && (
            <MainLayout
              title=""
              currentScreen="dashboard"
              onNavigate={handleNav}
              onLogout={handleLogout}
              onOpenTopUp={openTopUp}
              creditsBalance={creditsBalance}
              headerLeft="back"
              onHeaderBack={() => {
                setModulePurchaseReceipt(null);
                setScreen('dashboard');
              }}
            >
              <ModulePurchaseInvoiceScreen
                invoice={modulePurchaseReceipt.invoice}
                newCredits={modulePurchaseReceipt.newCredits}
                onDone={() => {
                  setModulePurchaseReceipt(null);
                  setScreen('dashboard');
                }}
              />
            </MainLayout>
          )}
        </UnreadMessagesProvider>
        </PoseSkeletonProvider>
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

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '80%',
    maxWidth: 320,
    height: 200,
  },
});

const logoutOverlayStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#041527',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
});

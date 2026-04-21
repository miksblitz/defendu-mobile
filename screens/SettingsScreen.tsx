/**
 * Settings: body metrics, training targets (skill profile), legal & support.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
  Platform,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthController } from '../lib/controllers/AuthController';
import { usePoseSkeletonOverlay } from '../lib/contexts/PoseSkeletonContext';

const PRIVACY_URL = 'https://defendu.com/privacy';
const TERMS_URL = 'https://defendu.com/terms';
const CONTACT_EMAIL = 'support@defendu.com';

const DAILY_TARGET_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WEEKLY_TARGET_OPTIONS = [3, 5, 7, 10, 12, 14, 16, 18, 20];
const TRAINING_FREQUENCIES = ['Never', '1-2 times per week', '3-4 times per week', 'Daily'] as const;
const TRAINING_MUSIC_MUTED_KEY = 'trainingModeMusicMuted';

export default function SettingsScreen() {
  const { skeletonVisible, setSkeletonVisible } = usePoseSkeletonOverlay();
  const [trainingMusicMuted, setTrainingMusicMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [heightInput, setHeightInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [savedHeight, setSavedHeight] = useState('');
  const [savedWeight, setSavedWeight] = useState('');
  const [savingBody, setSavingBody] = useState(false);

  const [weeklyTarget, setWeeklyTarget] = useState<number | null>(null);
  const [dailyTarget, setDailyTarget] = useState<number | null>(null);
  const [trainingFrequency, setTrainingFrequency] = useState<string | null>(null);
  const [savedWeekly, setSavedWeekly] = useState<number | null>(null);
  const [savedDaily, setSavedDaily] = useState<number | null>(null);
  const [savedFrequency, setSavedFrequency] = useState<string | null>(null);
  const [savingGoals, setSavingGoals] = useState(false);

  const [showWeeklyPicker, setShowWeeklyPicker] = useState(false);
  const [showDailyPicker, setShowDailyPicker] = useState(false);
  const [showFreqPicker, setShowFreqPicker] = useState(false);
  const [resettingProgress, setResettingProgress] = useState(false);
  const [activeSupportSection, setActiveSupportSection] = useState<'help' | 'privacy' | 'contact'>('help');
  const [supportName, setSupportName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportMessage, setSupportMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [user, full] = await Promise.all([
        AuthController.getCurrentUser(),
        AuthController.getFullSkillProfile(),
      ]);
      if (user) {
        const h = user.height ?? full?.physicalAttributes.height;
        const w = user.weight ?? full?.physicalAttributes.weight;
        const hs = h != null ? String(h) : '';
        const ws = w != null ? String(w) : '';
        setHeightInput(hs);
        setWeightInput(ws);
        setSavedHeight(hs);
        setSavedWeight(ws);
      }
      if (full) {
        const wk = full.preferences.targetModulesPerWeek;
        const dy = full.preferences.targetModulesPerDay;
        const fq = full.fitnessCapabilities.trainingFrequency;
        setWeeklyTarget(wk);
        setDailyTarget(dy);
        setTrainingFrequency(fq);
        setSavedWeekly(wk);
        setSavedDaily(dy);
        setSavedFrequency(fq);
      } else {
        setWeeklyTarget(null);
        setDailyTarget(null);
        setTrainingFrequency(null);
        setSavedWeekly(null);
        setSavedDaily(null);
        setSavedFrequency(null);
      }
    } catch (e) {
      console.error('SettingsScreen load:', e);
      Alert.alert('Error', 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(TRAINING_MUSIC_MUTED_KEY)
      .then((raw) => {
        if (cancelled) return;
        setTrainingMusicMuted(raw === '1');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleTrainingMusicMuted = useCallback((value: boolean) => {
    setTrainingMusicMuted(value);
    AsyncStorage.setItem(TRAINING_MUSIC_MUTED_KEY, value ? '1' : '0').catch(() => {});
  }, []);

  const hasBodyChanges = heightInput !== savedHeight || weightInput !== savedWeight;
  const hasGoalChanges =
    weeklyTarget !== savedWeekly ||
    dailyTarget !== savedDaily ||
    trainingFrequency !== savedFrequency;

  const handleSaveBody = async () => {
    const h = heightInput.trim() ? Number(heightInput.trim()) : undefined;
    const w = weightInput.trim() ? Number(weightInput.trim()) : undefined;
    if (h !== undefined && (isNaN(h) || h < 50 || h > 250)) {
      Alert.alert('Invalid height', 'Please enter a height between 50 and 250 cm.');
      return;
    }
    if (w !== undefined && (isNaN(w) || w < 20 || w > 300)) {
      Alert.alert('Invalid weight', 'Please enter a weight between 20 and 300 kg.');
      return;
    }
    setSavingBody(true);
    try {
      await AuthController.updateUserProfile({
        ...(h !== undefined && { height: h }),
        ...(w !== undefined && { weight: w }),
      });
      if (h !== undefined) setSavedHeight(String(h));
      if (w !== undefined) setSavedWeight(String(w));
    } catch (e) {
      console.error('updateUserProfile:', e);
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSavingBody(false);
    }
  };

  const handleSaveGoals = async () => {
    if (weeklyTarget == null || dailyTarget == null || !trainingFrequency) {
      Alert.alert('Incomplete', 'Choose weekly modules, daily modules, and how often you train.');
      return;
    }
    setSavingGoals(true);
    try {
      await AuthController.updateSkillProfilePartial({
        preferences: { targetModulesPerWeek: weeklyTarget, targetModulesPerDay: dailyTarget },
        fitnessCapabilities: { trainingFrequency },
      });
      setSavedWeekly(weeklyTarget);
      setSavedDaily(dailyTarget);
      setSavedFrequency(trainingFrequency);
      setShowWeeklyPicker(false);
      setShowDailyPicker(false);
      setShowFreqPicker(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save. Try again.';
      Alert.alert('Error', msg);
    } finally {
      setSavingGoals(false);
    }
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open link.'));
  };

  const submitSupportRequest = () => {
    const body = supportMessage.trim();
    if (!body) {
      Alert.alert('Missing message', 'Please add your concern before sending.');
      return;
    }
    const subject = encodeURIComponent('DEFENDU Support Request');
    const content = encodeURIComponent(
      `Name: ${supportName || 'N/A'}\nEmail: ${supportEmail || 'N/A'}\n\nMessage:\n${body}`
    );
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${content}`).catch(() =>
      Alert.alert('Error', 'Could not open email.')
    );
  };

  const handleResetAllProgress = () => {
    Alert.alert(
      'Reset all progress?',
      'Warning: this will permanently clear your completed modules and weekly goal data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResettingProgress(true);
            try {
              await AuthController.resetUserProgress();
              Alert.alert('Done', 'Your progress has been reset.');
            } catch (e) {
              console.error('resetUserProgress:', e);
              Alert.alert('Error', 'Could not reset progress. Please try again.');
            } finally {
              setResettingProgress(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Image source={require('../assets/images/settings.png')} style={styles.heroIcon} resizeMode="contain" />
          <View style={styles.heroTextCol}>
            <Text style={styles.heroTitle}>Training hub</Text>
            <Text style={styles.heroSubtitle}>
              Tune your body metrics, module targets, and how often you train — same choices as your skill profile, editable anytime.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTag}>POSE</Text>
          <Text style={styles.cardTitle}>MediaPipe skeleton</Text>
          <Text style={styles.cardHint}>
            Show or hide the body wireframe on the pose camera. Tracking and rep counting stay on either way.
          </Text>
          <View style={styles.switchRow}>
            <View style={styles.switchLabels}>
              <Text style={styles.switchTitle}>Skeleton overlay</Text>
              <Text style={styles.switchSubtitle}>{skeletonVisible ? 'On' : 'Off'}</Text>
            </View>
            <Switch
              value={skeletonVisible}
              onValueChange={setSkeletonVisible}
              trackColor={{ false: '#062731', true: 'rgba(7, 187, 192, 0.45)' }}
              thumbColor={skeletonVisible ? '#07bbc0' : '#6b8693'}
              ios_backgroundColor="#062731"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTag}>MUSIC</Text>
          <Text style={styles.cardTitle}>Training mode music</Text>
          <Text style={styles.cardHint}>
            Control background beat playback during warmups, cooldowns, and pose training.
          </Text>
          <View style={styles.switchRow}>
            <View style={styles.switchLabels}>
              <Text style={styles.switchTitle}>Mute music during training mode</Text>
              <Text style={styles.switchSubtitle}>{trainingMusicMuted ? 'Muted' : 'Playing'}</Text>
            </View>
            <Switch
              value={trainingMusicMuted}
              onValueChange={handleToggleTrainingMusicMuted}
              trackColor={{ false: '#062731', true: 'rgba(7, 187, 192, 0.45)' }}
              thumbColor={trainingMusicMuted ? '#07bbc0' : '#6b8693'}
              ios_backgroundColor="#062731"
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator size="large" color="#07bbc0" style={styles.inlineLoader} />
            <Text style={[styles.cardHint, styles.inlineLoaderHint]}>Loading your profile…</Text>
          </View>
        ) : (
          <React.Fragment>
        <View style={styles.card}>
          <Text style={styles.cardTag}>BODY</Text>
          <Text style={styles.cardTitle}>Height & weight</Text>
          <Text style={styles.cardHint}>Used for personalization and pose context.</Text>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Height (cm)</Text>
            <TextInput
              style={styles.input}
              value={heightInput}
              onChangeText={setHeightInput}
              placeholder="e.g. 170"
              placeholderTextColor="#6b8693"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Weight (kg)</Text>
            <TextInput
              style={styles.input}
              value={weightInput}
              onChangeText={setWeightInput}
              placeholder="e.g. 70"
              placeholderTextColor="#6b8693"
              keyboardType="numeric"
            />
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, (savingBody || !hasBodyChanges) && styles.btnDisabled]}
            onPress={handleSaveBody}
            disabled={savingBody || !hasBodyChanges}
          >
            <Text style={styles.primaryBtnText}>{savingBody ? 'Saving…' : 'Save body metrics'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTag}>GOALS</Text>
          <Text style={styles.cardTitle}>Weekly rhythm</Text>
          <Text style={styles.cardHint}>
            Module targets (dashboard goals) and how many days per week you typically train.
          </Text>

          <Text style={styles.pickerLabel}>Target modules per week</Text>
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() => {
              setShowWeeklyPicker(!showWeeklyPicker);
              setShowDailyPicker(false);
              setShowFreqPicker(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={weeklyTarget != null ? styles.selectText : styles.placeholderText}>
              {weeklyTarget != null ? `${weeklyTarget} modules / week` : 'Select…'}
            </Text>
            <Text style={styles.chevron}>{showWeeklyPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showWeeklyPicker && (
            <View style={styles.pickerList}>
              {WEEKLY_TARGET_OPTIONS.map((value) => (
                <TouchableOpacity
                  key={value}
                  style={styles.pickerItem}
                  onPress={() => {
                    setWeeklyTarget(value);
                    setShowWeeklyPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{value} modules / week</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.pickerLabel}>Target modules per day</Text>
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() => {
              setShowDailyPicker(!showDailyPicker);
              setShowWeeklyPicker(false);
              setShowFreqPicker(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={dailyTarget != null ? styles.selectText : styles.placeholderText}>
              {dailyTarget != null ? `${dailyTarget} modules / day` : 'Select…'}
            </Text>
            <Text style={styles.chevron}>{showDailyPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showDailyPicker && (
            <View style={styles.pickerList}>
              {DAILY_TARGET_OPTIONS.map((value) => (
                <TouchableOpacity
                  key={value}
                  style={styles.pickerItem}
                  onPress={() => {
                    setDailyTarget(value);
                    setShowDailyPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{value} modules / day</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.pickerLabel}>How often you train</Text>
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() => {
              setShowFreqPicker(!showFreqPicker);
              setShowWeeklyPicker(false);
              setShowDailyPicker(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={trainingFrequency ? styles.selectText : styles.placeholderText}>
              {trainingFrequency || 'Select…'}
            </Text>
            <Text style={styles.chevron}>{showFreqPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showFreqPicker && (
            <View style={styles.pickerList}>
              {TRAINING_FREQUENCIES.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={styles.pickerItem}
                  onPress={() => {
                    setTrainingFrequency(key);
                    setShowFreqPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{key}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, (savingGoals || !hasGoalChanges) && styles.btnDisabled]}
            onPress={handleSaveGoals}
            disabled={savingGoals || !hasGoalChanges}
          >
            <Text style={styles.primaryBtnText}>{savingGoals ? 'Saving…' : 'Save training goals'}</Text>
          </TouchableOpacity>
        </View>
          </React.Fragment>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTag}>SUPPORT</Text>
          <Text style={styles.supportTitle}>Support Hub</Text>
          <Text style={styles.supportSubtitle}>
            Choose a topic below to view details.
          </Text>

          <View style={styles.supportTabsRow}>
            <TouchableOpacity
              style={[styles.supportTabBtn, activeSupportSection === 'help' && styles.supportTabBtnActive]}
              onPress={() => setActiveSupportSection('help')}
              activeOpacity={0.85}
            >
              <Text style={[styles.supportTabText, activeSupportSection === 'help' && styles.supportTabTextActive]}>
                Help & Support
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.supportTabBtn, activeSupportSection === 'privacy' && styles.supportTabBtnActive]}
              onPress={() => setActiveSupportSection('privacy')}
              activeOpacity={0.85}
            >
              <Text style={[styles.supportTabText, activeSupportSection === 'privacy' && styles.supportTabTextActive]}>
                Privacy Policy
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.supportTabBtn, activeSupportSection === 'contact' && styles.supportTabBtnActive]}
              onPress={() => setActiveSupportSection('contact')}
              activeOpacity={0.85}
            >
              <Text style={[styles.supportTabText, activeSupportSection === 'contact' && styles.supportTabTextActive]}>
                Contact Us
              </Text>
            </TouchableOpacity>
          </View>

          {activeSupportSection === 'help' ? (
            <View style={styles.supportPanel}>
              <Text style={styles.supportPanelTitle}>Help & Support</Text>
              <Text style={styles.supportMiniHeading}>Getting started</Text>
              <Text style={styles.supportLine}>- Update your profile details and photo in Profile.</Text>
              <Text style={styles.supportLine}>- Set weekly and daily training goals in Settings.</Text>
              <Text style={styles.supportLine}>- Open modules from Dashboard and follow guided practice.</Text>
              <Text style={styles.supportMiniHeading}>Need troubleshooting?</Text>
              <Text style={styles.supportLine}>- Check internet connection and restart app if modules do not load.</Text>
              <Text style={styles.supportLine}>- For account issues, use Contact Us with your registered email.</Text>
            </View>
          ) : null}

          {activeSupportSection === 'privacy' ? (
            <View style={styles.supportPanel}>
              <Text style={styles.supportPanelTitle}>Privacy Policy</Text>
              <Text style={styles.supportMiniHeading}>What we collect</Text>
              <Text style={styles.supportLine}>- Account details like name, email, and profile media.</Text>
              <Text style={styles.supportLine}>- Training activity such as modules completed and progress stats.</Text>
              <Text style={styles.supportLine}>- Support communication you send through the app.</Text>
              <Text style={styles.supportMiniHeading}>How we use data</Text>
              <Text style={styles.supportLine}>- Personalize training suggestions and module experience.</Text>
              <Text style={styles.supportLine}>- Keep your account secure and improve app reliability.</Text>
              <Text style={styles.supportLine}>- Respond to help requests and technical concerns.</Text>
              <View style={styles.supportActionRow}>
                <TouchableOpacity style={styles.supportGhostBtn} onPress={() => openLink(PRIVACY_URL)}>
                  <Text style={styles.supportGhostBtnText}>Full Privacy Policy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.supportGhostBtn} onPress={() => openLink(TERMS_URL)}>
                  <Text style={styles.supportGhostBtnText}>Terms of Service</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {activeSupportSection === 'contact' ? (
            <View style={styles.supportPanel}>
              <Text style={styles.supportPanelTitle}>Contact Us</Text>
              <Text style={styles.supportLine}>Email support: {CONTACT_EMAIL}</Text>
              <Text style={styles.supportLine}>Response time: usually within 24-48 hours (Mon-Fri).</Text>
              <Text style={styles.supportMiniHeading}>Send a support request</Text>

              <View style={styles.supportFormWrap}>
                <TextInput
                  style={styles.supportInput}
                  value={supportName}
                  onChangeText={setSupportName}
                  placeholder="Your name"
                  placeholderTextColor="#6b8693"
                />
                <TextInput
                  style={styles.supportInput}
                  value={supportEmail}
                  onChangeText={setSupportEmail}
                  placeholder="Your email"
                  placeholderTextColor="#6b8693"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TextInput
                  style={[styles.supportInput, styles.supportInputLarge]}
                  value={supportMessage}
                  onChangeText={setSupportMessage}
                  placeholder="Write your concern"
                  placeholderTextColor="#6b8693"
                  multiline
                />
                <TouchableOpacity style={styles.supportSendBtn} onPress={submitSupportRequest}>
                  <Text style={styles.supportSendBtnText}>Send support request</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        <View style={[styles.card, styles.dangerCard]}>
          <Text style={[styles.cardTag, styles.dangerTag]}>DANGER ZONE</Text>
          <Text style={styles.cardTitle}>Reset all progress</Text>
          <Text style={[styles.cardHint, styles.dangerHint]}>
            Warning: this clears your completed modules and weekly goal data permanently.
          </Text>
          <TouchableOpacity
            style={[styles.dangerBtn, resettingProgress && styles.btnDisabled]}
            onPress={handleResetAllProgress}
            disabled={resettingProgress}
          >
            <Text style={styles.dangerBtnText}>{resettingProgress ? 'Resetting…' : 'Reset all progress'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>Changes sync to your account and skill profile.</Text>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#041527' },
  scroll: { flex: 1 },
  inlineLoader: { paddingVertical: 20 },
  inlineLoaderHint: { textAlign: 'center', marginTop: 0, marginBottom: 0 },
  content: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 32 },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 22,
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(7, 187, 192, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.35)',
  },
  heroIcon: { width: 52, height: 52, marginTop: 2 },
  heroTextCol: { flex: 1 },
  heroTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  heroSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: '#011f36',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#062731',
  },
  cardTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#07bbc0',
    letterSpacing: 2,
    marginBottom: 6,
  },
  cardTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cardHint: { color: '#6b8693', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 16,
  },
  switchLabels: { flex: 1 },
  switchTitle: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  switchSubtitle: { color: '#6b8693', fontSize: 13, marginTop: 4 },
  fieldBlock: { marginBottom: 12 },
  label: { fontSize: 13, color: '#6b8693', marginBottom: 6 },
  input: {
    backgroundColor: '#062731',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#0a3645',
  },
  pickerLabel: { fontSize: 13, color: '#6b8693', marginBottom: 8, marginTop: 4 },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#062731',
    backgroundColor: '#062731',
    marginBottom: 8,
  },
  selectText: { color: '#FFF', fontSize: 15, flex: 1 },
  placeholderText: { color: '#6b8693', fontSize: 15, flex: 1 },
  chevron: { color: '#6b8693', fontSize: 12, marginLeft: 8 },
  pickerList: {
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#062731',
    backgroundColor: '#041527',
    overflow: 'hidden',
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#062731',
  },
  pickerItemText: { color: '#FFF', fontSize: 15 },
  primaryBtn: {
    backgroundColor: '#07bbc0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#041527', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#062731',
  },
  linkRowLast: { borderBottomWidth: 0 },
  linkText: { color: '#FFF', fontSize: 16 },
  linkChevron: { color: '#6b8693', fontSize: 20 },
  supportTitle: { color: '#FFF', fontSize: 28, fontWeight: '800', marginBottom: 6 },
  supportSubtitle: { color: 'rgba(255,255,255,0.76)', fontSize: 13, lineHeight: 20, marginBottom: 14 },
  supportTabsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  supportTabBtn: {
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(7, 187, 192, 0.08)',
  },
  supportTabBtnActive: {
    backgroundColor: '#07bbc0',
    borderColor: '#07bbc0',
  },
  supportTabText: { color: '#07bbc0', fontSize: 12, fontWeight: '700' },
  supportTabTextActive: { color: '#041527' },
  supportPanel: {
    backgroundColor: '#011f36',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#062731',
    padding: 14,
    marginBottom: 12,
  },
  supportPanelTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  supportMiniHeading: { color: '#8be8eb', fontSize: 13, fontWeight: '700', marginTop: 6, marginBottom: 4 },
  supportLine: { color: '#cfe3ea', fontSize: 13, lineHeight: 20, marginBottom: 6 },
  supportActionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  supportGhostBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(7, 187, 192, 0.1)',
  },
  supportGhostBtnText: { color: '#07bbc0', fontSize: 12, fontWeight: '800' },
  supportFormWrap: { marginTop: 8 },
  supportInput: {
    backgroundColor: '#062731',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#FFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#0a3645',
    marginBottom: 10,
  },
  supportInputLarge: { minHeight: 110, textAlignVertical: 'top' },
  supportSendBtn: {
    backgroundColor: '#07bbc0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  supportSendBtnText: { color: '#041527', fontSize: 15, fontWeight: '800' },
  dangerCard: {
    borderColor: 'rgba(229, 115, 115, 0.45)',
    backgroundColor: 'rgba(229, 115, 115, 0.08)',
  },
  dangerTag: { color: '#e57373' },
  dangerHint: { color: 'rgba(255, 193, 193, 0.95)' },
  dangerBtn: {
    borderWidth: 1,
    borderColor: '#e57373',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(229, 115, 115, 0.1)',
  },
  dangerBtnText: { color: '#ffb4b4', fontSize: 16, fontWeight: '700' },
  footerNote: { color: '#6b8693', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 8 },
});

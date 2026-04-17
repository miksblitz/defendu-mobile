/**
 * SkillProfilePreferencesScreen
 * Skill profile step 2: preferred techniques, training goals.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSkillProfile } from '../lib/contexts/SkillProfileContext';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

// --- Types ---
interface SkillProfilePreferencesScreenProps {
  onNext: () => void;
  onBack: () => void;
}

const PREFERRED_TECHNIQUES = [
  { key: 'Punching', icon: 'flash' },
  { key: 'Kicking', icon: 'human-handsup' },
  { key: 'Elbow Strikes', icon: 'hands-helping' },
  { key: 'Knee Strikes', icon: 'hand-rock' },
  { key: 'Defensive Moves', icon: 'shield-alt' },
];
const DAILY_TARGET_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WEEKLY_TARGET_OPTIONS = [3, 5, 7, 10, 12, 14, 16, 18, 20];

// --- Component ---
export default function SkillProfilePreferencesScreen({ onNext, onBack }: SkillProfilePreferencesScreenProps) {
  const { setPreferences, preferences } = useSkillProfile();
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();
  const [selectedTechniques, setSelectedTechniques] = useState(
    Array.isArray(preferences?.preferredTechnique) ? preferences.preferredTechnique : (preferences?.preferredTechnique ? [preferences.preferredTechnique] : [])
  );
  const [dailyTarget, setDailyTarget] = useState<number | null>(preferences?.targetModulesPerDay ?? null);
  const [weeklyTarget, setWeeklyTarget] = useState<number | null>(preferences?.targetModulesPerWeek ?? null);
  const [showDailyPicker, setShowDailyPicker] = useState(false);
  const [showWeeklyPicker, setShowWeeklyPicker] = useState(false);
  const [errors, setErrors] = useState({ technique: '', dailyTarget: '', weeklyTarget: '' });

  const handleBack = () => {
    setPreferences({
      preferredTechnique: selectedTechniques,
      trainingGoal: preferences?.trainingGoal ?? [],
      targetModulesPerDay: dailyTarget ?? 5,
      targetModulesPerWeek: weeklyTarget ?? 35,
    });
    onBack();
  };

  const handleNext = () => {
    const techniqueError = selectedTechniques.length === 0 ? 'Please select at least one preferred technique' : '';
    const dailyTargetError = dailyTarget == null ? 'Please select your daily module target' : '';
    const weeklyTargetError = weeklyTarget == null ? 'Please select your weekly module target' : '';
    setErrors({ technique: techniqueError, dailyTarget: dailyTargetError, weeklyTarget: weeklyTargetError });
    if (techniqueError || dailyTargetError || weeklyTargetError) {
      showToast('Invalid inputs. Try again');
      return;
    }
    setPreferences({
      preferredTechnique: selectedTechniques,
      trainingGoal: preferences?.trainingGoal ?? [],
      targetModulesPerDay: dailyTarget as number,
      targetModulesPerWeek: weeklyTarget as number,
    });
    onNext();
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Image source={require('../assets/images/icon-back.png')} style={styles.backButtonIcon} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Setup Profile</Text>
          <Text style={styles.progress}>2 of 4</Text>
        </View>
        <View style={styles.progressBarBackground}>
          <View style={styles.progressBarFill} />
        </View>
        <Text style={styles.subtitle}>Choose your preferred training focus</Text>
        <Text style={styles.sectionTitle}>Preferred Techniques</Text>
        <View style={styles.optionsColumn}>
          {PREFERRED_TECHNIQUES.map(({ key }) => {
            const selected = selectedTechniques.includes(key);
            return (
              <TouchableOpacity key={key} style={styles.optionRow} onPress={() => { if (selected) setSelectedTechniques(selectedTechniques.filter((t) => t !== key)); else setSelectedTechniques([...selectedTechniques, key]); setErrors((e) => ({ ...e, technique: '' })); }} activeOpacity={0.7}>
                <View style={[styles.checkboxOuter, selected && styles.checkboxSelected]}>{selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}</View>
                <Text style={styles.optionText}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.technique ? <Text style={styles.errorText}>{errors.technique}</Text> : null}
        <Text style={styles.sectionTitle}>What's your target modules in a week?</Text>
        <TouchableOpacity
          style={[styles.selectBtn, errors.weeklyTarget ? styles.selectBtnError : null]}
          onPress={() => {
            setShowWeeklyPicker(!showWeeklyPicker);
            if (showDailyPicker) setShowDailyPicker(false);
          }}
          activeOpacity={0.7}
        >
          <Text style={weeklyTarget != null ? styles.selectText : styles.placeholderText}>
            {weeklyTarget != null ? `${weeklyTarget} modules/week` : 'Select weekly target'}
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
                  if (errors.weeklyTarget) setErrors((e) => ({ ...e, weeklyTarget: '' }));
                }}
              >
                <Text style={styles.pickerItemText}>{value} modules/week</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {errors.weeklyTarget ? <Text style={styles.errorText}>{errors.weeklyTarget}</Text> : null}

        <Text style={styles.sectionTitle}>How many training modules would you like to complete in a day?</Text>
        <TouchableOpacity
          style={[styles.selectBtn, errors.dailyTarget ? styles.selectBtnError : null]}
          onPress={() => {
            setShowDailyPicker(!showDailyPicker);
            if (showWeeklyPicker) setShowWeeklyPicker(false);
          }}
          activeOpacity={0.7}
        >
          <Text style={dailyTarget != null ? styles.selectText : styles.placeholderText}>
            {dailyTarget != null ? `${dailyTarget} modules/day` : 'Select daily target'}
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
                  if (errors.dailyTarget) setErrors((e) => ({ ...e, dailyTarget: '' }));
                }}
              >
                <Text style={styles.pickerItemText}>{value} modules/day</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {errors.dailyTarget ? <Text style={styles.errorText}>{errors.dailyTarget}</Text> : null}

        <TouchableOpacity style={styles.nextButton} activeOpacity={0.7} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Next</Text>
        </TouchableOpacity>
      </ScrollView>
      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#041527' },
  container: { backgroundColor: '#041527', paddingHorizontal: 24, paddingVertical: 30, flexGrow: 1, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 8 },
  backButton: { padding: 4 },
  backButtonIcon: { width: 24, height: 24 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold' },
  progress: { color: '#FFFFFF', fontSize: 14, opacity: 0.6 },
  progressBarBackground: { width: '100%', height: 4, backgroundColor: '#073741', borderRadius: 4, marginBottom: 32 },
  progressBarFill: { height: 4, backgroundColor: '#09AEC3', width: '50%', borderRadius: 4 },
  subtitle: { color: '#FFFFFF', fontSize: 14, marginBottom: 20, textAlign: 'center' },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginVertical: 12, textAlign: 'center' },
  optionsColumn: { width: '100%', maxWidth: 320, marginBottom: 20 },
  optionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  selectBtn: {
    width: '100%',
    maxWidth: 320,
    minHeight: 48,
    backgroundColor: '#011f36',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0a3645',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectBtnError: { borderColor: '#FF4444' },
  selectText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  placeholderText: { color: '#8fa3b0', fontSize: 14 },
  chevron: { color: '#07bbc0', fontSize: 14, fontWeight: '700' },
  pickerList: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#0a3645',
    borderRadius: 10,
    marginBottom: 14,
    overflow: 'hidden',
    backgroundColor: '#011f36',
  },
  pickerItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#0a3645' },
  pickerItemText: { color: '#FFFFFF', fontSize: 14 },
  checkboxOuter: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#09AEC3', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  checkboxSelected: { borderColor: '#09AEC3', backgroundColor: '#09AEC3' },
  optionText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  nextButton: { marginTop: 40, backgroundColor: '#09AEC3', borderRadius: 25, paddingVertical: 12, alignItems: 'center', width: 170, alignSelf: 'center' },
  nextButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  errorText: { color: '#FF4444', fontSize: 12, marginTop: -8, marginBottom: 8, alignSelf: 'center', maxWidth: 320 },
});

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
  { key: 'Palm Strikes', icon: 'hand-paper-o' },
  { key: 'Elbow Strikes', icon: 'hands-helping' },
  { key: 'Knee Strikes', icon: 'hand-rock' },
  { key: 'Defensive Moves', icon: 'shield-alt' },
];
const TRAINING_GOALS = [
  { key: 'Personal Safety', icon: 'shield' },
  { key: 'Fitness', icon: 'dumbbell' },
  { key: 'Confidence Building', icon: 'trophy' },
];

// --- Component ---
export default function SkillProfilePreferencesScreen({ onNext, onBack }: SkillProfilePreferencesScreenProps) {
  const { setPreferences, preferences } = useSkillProfile();
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();
  const [selectedTechniques, setSelectedTechniques] = useState(
    Array.isArray(preferences?.preferredTechnique) ? preferences.preferredTechnique : (preferences?.preferredTechnique ? [preferences.preferredTechnique] : [])
  );
  const [selectedGoals, setSelectedGoals] = useState(
    Array.isArray(preferences?.trainingGoal) ? preferences.trainingGoal : (preferences?.trainingGoal ? [preferences.trainingGoal] : [])
  );
  const [errors, setErrors] = useState({ technique: '', goal: '' });

  const handleBack = () => {
    setPreferences({ preferredTechnique: selectedTechniques, trainingGoal: selectedGoals });
    onBack();
  };

  const handleNext = () => {
    const techniqueError = selectedTechniques.length === 0 ? 'Please select at least one preferred technique' : '';
    const goalError = selectedGoals.length === 0 ? 'Please select at least one training goal' : '';
    setErrors({ technique: techniqueError, goal: goalError });
    if (techniqueError || goalError) {
      showToast('Invalid inputs. Try again');
      return;
    }
    setPreferences({ preferredTechnique: selectedTechniques, trainingGoal: selectedGoals });
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
        <Text style={styles.sectionTitle}>Training Goals</Text>
        <View style={styles.optionsColumn}>
          {TRAINING_GOALS.map(({ key }) => {
            const selected = selectedGoals.includes(key);
            return (
              <TouchableOpacity key={key} style={styles.optionRow} onPress={() => { if (selected) setSelectedGoals(selectedGoals.filter((g) => g !== key)); else setSelectedGoals([...selectedGoals, key]); setErrors((e) => ({ ...e, goal: '' })); }} activeOpacity={0.7}>
                <View style={[styles.checkboxOuter, selected && styles.checkboxSelected]}>{selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}</View>
                <Text style={styles.optionText}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.goal ? <Text style={styles.errorText}>{errors.goal}</Text> : null}
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
  checkboxOuter: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#09AEC3', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  checkboxSelected: { borderColor: '#09AEC3', backgroundColor: '#09AEC3' },
  optionText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  nextButton: { marginTop: 40, backgroundColor: '#09AEC3', borderRadius: 25, paddingVertical: 12, alignItems: 'center', width: 170, alignSelf: 'center' },
  nextButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  errorText: { color: '#FF4444', fontSize: 12, marginTop: -8, marginBottom: 8, alignSelf: 'center', maxWidth: 320 },
});

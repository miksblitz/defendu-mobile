import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Image } from 'react-native';
import { MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSkillProfile } from '../lib/contexts/SkillProfileContext';
import { AuthController } from '../lib/controllers/AuthController';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

interface SkillProfileFitnessScreenProps {
  onComplete: () => void;
  onBack: () => void;
}

const CURRENT_FITNESS_LEVELS = [
  { key: 'Low', subtitle: 'Sedentary Lifestyle' },
  { key: 'Moderate', subtitle: 'Some regular activity' },
  { key: 'High', subtitle: 'Very Active' },
  { key: 'Athlete', subtitle: 'Professional Level' },
];
const TRAINING_FREQUENCIES = ['Never', '1-2 times per week', '3-4 times per week', 'Daily'];

export default function SkillProfileFitnessScreen({ onComplete, onBack }: SkillProfileFitnessScreenProps) {
  const { setFitnessCapabilities, fitnessCapabilities, physicalAttributes, preferences, pastExperience, clearProfile } = useSkillProfile();
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();
  const [selectedCurrentLevel, setSelectedCurrentLevel] = useState<string | null>(fitnessCapabilities?.currentFitnessLevel ?? null);
  const [selectedTrainingFrequency, setSelectedTrainingFrequency] = useState<string | null>(fitnessCapabilities?.trainingFrequency ?? null);
  const [injuries, setInjuries] = useState(fitnessCapabilities?.injuries || '');
  const [hasNoInjuries, setHasNoInjuries] = useState(!fitnessCapabilities?.injuries);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ fitnessLevel: '', trainingFrequency: '' });

  const handleBack = () => {
    setFitnessCapabilities({
      currentFitnessLevel: selectedCurrentLevel || '',
      trainingFrequency: selectedTrainingFrequency || '',
      injuries: hasNoInjuries ? undefined : (injuries || undefined),
    });
    onBack();
  };

  const handleComplete = async () => {
    const fitnessLevelError = !selectedCurrentLevel ? 'Please select a current fitness level' : '';
    const trainingFrequencyError = !selectedTrainingFrequency ? 'Please select a training frequency' : '';
    setErrors({ fitnessLevel: fitnessLevelError, trainingFrequency: trainingFrequencyError });
    if (fitnessLevelError || trainingFrequencyError) {
      showToast('Invalid inputs. Try again');
      return;
    }
    if (!physicalAttributes || !preferences || !pastExperience) {
      showToast('Missing profile data. Please go back and complete all sections.');
      return;
    }
    const fitnessCapabilitiesData = {
      currentFitnessLevel: selectedCurrentLevel as string,
      trainingFrequency: selectedTrainingFrequency as string,
      injuries: hasNoInjuries ? undefined : (injuries || undefined),
    };
    setFitnessCapabilities(fitnessCapabilitiesData);
    setLoading(true);
    try {
      const currentUser = await AuthController.getCurrentUser();
      if (!currentUser) {
        showToast('User not authenticated. Please log in again.');
        setLoading(false);
        return;
      }
      const completeProfile = {
        uid: currentUser.uid,
        physicalAttributes,
        preferences,
        pastExperience,
        fitnessCapabilities: fitnessCapabilitiesData,
        completedAt: new Date(),
      };
      await AuthController.saveSkillProfile(completeProfile);
      clearProfile();
      onComplete();
    } catch (error) {
      console.error('Error saving skill profile:', error);
      showToast((error as Error)?.message ?? 'Failed to save skill profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backRow}>
            <Image source={require('../assets/images/icon-back.png')} style={styles.backIcon} resizeMode="contain" />
            <Text style={styles.backText}>Fitness Capabilities</Text>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Setup Profile</Text>
            <Text style={styles.progress}>4 of 4</Text>
          </View>
        </View>
        <View style={styles.progressBarBackground}>
          <View style={styles.progressBarFill} />
        </View>
        <Text style={styles.subtitle}>Help us match your fitness level</Text>
        <Text style={styles.sectionTitle}>Current Fitness Level</Text>
        <View style={styles.optionsColumn}>
          {CURRENT_FITNESS_LEVELS.map(({ key, subtitle }) => {
            const selected = selectedCurrentLevel === key;
            return (
              <TouchableOpacity key={key} style={styles.optionRow} onPress={() => { setSelectedCurrentLevel(key); setErrors((e) => ({ ...e, fitnessLevel: '' })); }} activeOpacity={0.7}>
                <View style={[styles.radioOuterCircle, selected && styles.radioCircleSelected]}>{selected && <View style={styles.radioInnerCircle} />}</View>
                <View style={styles.optionTextWrapper}>
                  <Text style={styles.optionTitle}>{key}</Text>
                  <Text style={styles.optionSubtitle}>{subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.fitnessLevel ? <Text style={styles.errorText}>{errors.fitnessLevel}</Text> : null}
        <Text style={styles.sectionTitle}>Training Frequency</Text>
        <View style={styles.optionsColumn}>
          {TRAINING_FREQUENCIES.map((key) => {
            const selected = selectedTrainingFrequency === key;
            return (
              <TouchableOpacity key={key} style={styles.optionRow} onPress={() => { setSelectedTrainingFrequency(key); setErrors((e) => ({ ...e, trainingFrequency: '' })); }} activeOpacity={0.7}>
                <View style={[styles.radioOuterCircle, selected && styles.radioCircleSelected]}>{selected && <View style={styles.radioInnerCircle} />}</View>
                <Text style={styles.optionTitle}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.trainingFrequency ? <Text style={styles.errorText}>{errors.trainingFrequency}</Text> : null}
        <Text style={styles.sectionTitle}>Current Injuries or Concerns</Text>
        <TouchableOpacity style={styles.noneOptionRow} onPress={() => { setHasNoInjuries(!hasNoInjuries); if (!hasNoInjuries) setInjuries(''); }} activeOpacity={0.7}>
          <View style={[styles.radioOuterCircle, hasNoInjuries && styles.radioCircleSelected]}>{hasNoInjuries && <View style={styles.radioInnerCircle} />}</View>
          <Text style={styles.noneOptionText}>None</Text>
        </TouchableOpacity>
        {!hasNoInjuries && (
          <TextInput style={styles.textArea} placeholder="Any current injuries or physical concerns..." placeholderTextColor="#fff" multiline numberOfLines={4} value={injuries} onChangeText={setInjuries} selectionColor="#09AEC3" />
        )}
        <TouchableOpacity style={[styles.completeButton, loading && styles.completeButtonDisabled]} activeOpacity={0.7} onPress={handleComplete} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.completeButtonText}>Complete Setup</Text>}
        </TouchableOpacity>
      </ScrollView>
      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#041527' },
  container: { backgroundColor: '#041527', paddingHorizontal: 24, paddingVertical: 30, flexGrow: 1, alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 8 },
  headerRight: { alignItems: 'flex-end' },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backIcon: { width: 24, height: 24, marginRight: 8 },
  backText: { color: '#09AEC3', fontSize: 20, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  progress: { color: '#fff', fontSize: 14, opacity: 0.6 },
  progressBarBackground: { width: '100%', height: 4, backgroundColor: '#073741', borderRadius: 4, marginBottom: 32 },
  progressBarFill: { height: 4, backgroundColor: '#09AEC3', width: '100%', borderRadius: 4 },
  subtitle: { color: '#fff', fontSize: 14, marginBottom: 24, textAlign: 'center' },
  sectionTitle: { color: '#fff', fontWeight: '600', fontSize: 18, marginBottom: 16, alignSelf: 'center' },
  optionsColumn: { width: '100%', maxWidth: 320, marginBottom: 20 },
  optionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  radioOuterCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#09AEC3', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  radioCircleSelected: { borderColor: '#09AEC3' },
  radioInnerCircle: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#09AEC3' },
  optionTextWrapper: {},
  optionTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  optionSubtitle: { color: '#cccccc', fontSize: 13 },
  noneOptionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, width: '100%', maxWidth: 320 },
  noneOptionText: { color: '#FFFFFF', fontSize: 14 },
  textArea: { borderColor: '#073741', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#FFF', fontSize: 14, width: '100%', maxWidth: 320, minHeight: 80, textAlignVertical: 'top' },
  completeButton: { backgroundColor: '#09AEC3', height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', width: '85%', maxWidth: 260, marginTop: 24 },
  completeButtonDisabled: { opacity: 0.6 },
  completeButtonText: { color: '#FFF', fontWeight: '700', fontSize: 18 },
  errorText: { color: '#FF4444', fontSize: 12, marginTop: -8, marginBottom: 8, alignSelf: 'center', maxWidth: 320 },
});

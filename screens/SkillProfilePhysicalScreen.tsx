/**
 * SkillProfilePhysicalScreen
 * Skill profile step 1: physical stats, limitations, age.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { MaterialCommunityIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useSkillProfile } from '../lib/contexts/SkillProfileContext';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

// --- Types ---
interface SkillProfilePhysicalScreenProps {
  onNext: () => void;
  onBack: () => void;
}

// --- Constants & helpers ---
const PHYSICAL_LIMITATION_OPTIONS = [
  'No left arm', 'No right arm', 'No use of left arm', 'No use of right arm',
  'No left leg', 'No right leg', 'No use of left leg', 'No use of right leg',
  'Limited mobility in both arms', 'Limited mobility in both legs',
  'Wheelchair user', 'Upper body only (limited leg use)', 'Chronic back pain',
  'Chronic knee injury', 'Other joint or mobility limitation', 'Heart condition', 'Asthma', 'Other',
];

function parseLimitationsString(s: string | undefined): { selected: string[]; otherText: string } {
  if (!s || !s.trim()) return { selected: [], otherText: '' };
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const otherText = parts.filter((p) => !PHYSICAL_LIMITATION_OPTIONS.includes(p)).join(', ');
  const selected = parts.filter((p) => PHYSICAL_LIMITATION_OPTIONS.includes(p));
  if (otherText && !selected.includes('Other')) selected.push('Other');
  return { selected, otherText };
}

function buildLimitationsString(selected: string[], otherText: string): string {
  const list = selected.filter((x) => x !== 'Other');
  if (selected.includes('Other') && otherText.trim()) list.push(otherText.trim());
  return list.join(', ');
}

function validateHeight(value: string): string {
  if (!value) return 'Height is required';
  const num = Number(value);
  if (isNaN(num) || !/^\d*\.?\d*$/.test(value)) return 'Height must be a valid number';
  if (num < 80 || num > 250) return 'Height must be between 80-250 cm';
  return '';
}
function validateWeight(value: string): string {
  if (!value) return 'Weight is required';
  const num = Number(value);
  if (isNaN(num) || !/^\d*\.?\d*$/.test(value)) return 'Weight must be a valid number';
  if (num < 15 || num > 300) return 'Weight must be between 15-300 kg';
  return '';
}
function validateAge(value: string): string {
  if (!value) return 'Age is required';
  const num = Number(value);
  if (isNaN(num) || !/^\d+$/.test(value)) return 'Age must be a valid number';
  if (num < 4 || num > 120) return 'Age must be between 4-120 years';
  return '';
}

// --- Component ---
export default function SkillProfilePhysicalScreen({ onNext, onBack }: SkillProfilePhysicalScreenProps) {
  const { setPhysicalAttributes, physicalAttributes } = useSkillProfile();
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();

  const parsed = parseLimitationsString(physicalAttributes?.limitations);
  const [height, setHeight] = useState(physicalAttributes?.height?.toString() ?? '');
  const [weight, setWeight] = useState(physicalAttributes?.weight?.toString() ?? '');
  const [age, setAge] = useState(physicalAttributes?.age?.toString() ?? '');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | null>(physicalAttributes?.gender ?? null);
  const [selectedLimitations, setSelectedLimitations] = useState(parsed.selected);
  const [otherLimitationText, setOtherLimitationText] = useState(parsed.otherText);
  const [limitationsDropdownOpen, setLimitationsDropdownOpen] = useState(false);
  const hasNoLimitations = selectedLimitations.length === 0 && !otherLimitationText.trim();
  const [errors, setErrors] = useState({ height: '', weight: '', age: '', gender: '' });

  useEffect(() => {
    if (physicalAttributes) {
      setHeight(physicalAttributes.height?.toString() ?? '');
      setWeight(physicalAttributes.weight?.toString() ?? '');
      setAge(physicalAttributes.age?.toString() ?? '');
      setGender(physicalAttributes.gender ?? null);
      const p = parseLimitationsString(physicalAttributes.limitations);
      setSelectedLimitations(p.selected);
      setOtherLimitationText(p.otherText);
    }
  }, [physicalAttributes?.height, physicalAttributes?.weight, physicalAttributes?.age, physicalAttributes?.gender, physicalAttributes?.limitations]);

  const handleNext = () => {
    const heightError = validateHeight(height);
    const weightError = validateWeight(weight);
    const ageError = validateAge(age);
    const genderError = !gender ? 'Please select a gender' : '';
    setErrors({ height: heightError, weight: weightError, age: ageError, gender: genderError });
    if (heightError || weightError || ageError || genderError) {
      showToast('Invalid inputs. Try again');
      return;
    }
    const limitationsStr = hasNoLimitations ? undefined : buildLimitationsString(selectedLimitations, otherLimitationText) || undefined;
    setPhysicalAttributes({
      height: Number(height),
      weight: Number(weight),
      age: Number(age),
      gender: gender as 'Male' | 'Female' | 'Other',
      limitations: limitationsStr,
    });
    onNext();
  };

  const handleBack = () => {
    const limitationsStr = hasNoLimitations ? undefined : buildLimitationsString(selectedLimitations, otherLimitationText) || undefined;
    setPhysicalAttributes({
      height: Number(height),
      weight: Number(weight),
      age: Number(age),
      gender: gender || 'Other',
      limitations: limitationsStr,
    });
    onBack();
  };

  const toggleLimitation = (option: string) => {
    if (selectedLimitations.includes(option)) {
      setSelectedLimitations(selectedLimitations.filter((x) => x !== option));
    } else {
      setSelectedLimitations([...selectedLimitations, option]);
    }
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Image source={require('../assets/images/icon-back.png')} style={styles.backButtonIcon} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Setup Profile</Text>
          <Text style={styles.progress}>1 of 4</Text>
        </View>
        <View style={styles.progressBarBackground}>
          <View style={styles.progressBarFill} />
        </View>
        <Text style={styles.sectionTitle}>Physical Attributes</Text>
        <Text style={styles.sectionSubtitle}>Help us personalize your training experience</Text>

        <View style={styles.inputWrapper}>
          <Ionicons name="resize" size={18} color="#FFF" style={styles.icon} />
          <TextInput placeholder="Height (cm)" placeholderTextColor="#FFF" style={styles.input} keyboardType="numeric" value={height} onChangeText={(t) => { setHeight(t); if (errors.height) setErrors((e) => ({ ...e, height: '' })); }} onBlur={() => setErrors((e) => ({ ...e, height: validateHeight(height) }))} maxLength={3} selectionColor="#09AEC3" />
        </View>
        {errors.height ? <View style={styles.errorContainer}><Text style={styles.errorText}>{errors.height}</Text></View> : null}

        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="weight-lifter" size={18} color="#FFF" style={styles.icon} />
          <TextInput placeholder="Weight (kg)" placeholderTextColor="#FFF" style={styles.input} keyboardType="numeric" value={weight} onChangeText={(t) => { setWeight(t); if (errors.weight) setErrors((e) => ({ ...e, weight: '' })); }} onBlur={() => setErrors((e) => ({ ...e, weight: validateWeight(weight) }))} maxLength={3} selectionColor="#09AEC3" />
        </View>
        {errors.weight ? <View style={styles.errorContainer}><Text style={styles.errorText}>{errors.weight}</Text></View> : null}

        <View style={styles.inputWrapper}>
          <FontAwesome5 name="birthday-cake" size={18} color="#FFF" style={styles.icon} />
          <TextInput placeholder="Age" placeholderTextColor="#FFF" style={styles.input} keyboardType="numeric" value={age} onChangeText={(t) => { setAge(t); if (errors.age) setErrors((e) => ({ ...e, age: '' })); }} onBlur={() => setErrors((e) => ({ ...e, age: validateAge(age) }))} maxLength={3} selectionColor="#09AEC3" />
        </View>
        {errors.age ? <View style={styles.errorContainer}><Text style={styles.errorText}>{errors.age}</Text></View> : null}

        <Text style={styles.genderLabel}>Gender</Text>
        <View style={styles.genderOptions}>
          {(['Male', 'Female', 'Other'] as const).map((option) => {
            const selected = gender === option;
            return (
              <TouchableOpacity key={option} style={styles.genderOption} onPress={() => { setGender(option); if (errors.gender) setErrors((e) => ({ ...e, gender: '' })); }} activeOpacity={0.7}>
                <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>{selected && <View style={styles.radioInnerCircle} />}</View>
                <Text style={styles.genderOptionText}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.gender ? <View style={styles.errorContainer}><Text style={styles.errorText}>{errors.gender}</Text></View> : null}

        <View style={styles.limitationsLabelWrapper}>
          <Ionicons name="warning-outline" size={20} color="#FFF" />
          <Text style={styles.limitationsLabel}>Physical Limitations (Optional)</Text>
        </View>
        <TouchableOpacity style={styles.limitationsDropdownTrigger} onPress={() => setLimitationsDropdownOpen(!limitationsDropdownOpen)} activeOpacity={0.7}>
          <Text style={styles.limitationsDropdownTriggerText} numberOfLines={1}>
            {hasNoLimitations ? 'None' : selectedLimitations.length + (otherLimitationText ? 1 : 0) + ' selected — tap to change'}
          </Text>
          <Ionicons name={limitationsDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#09AEC3" />
        </TouchableOpacity>
        {limitationsDropdownOpen && (
          <View style={styles.limitationsDropdownBox}>
            <ScrollView style={styles.limitationsDropdownScroll} nestedScrollEnabled>
              {PHYSICAL_LIMITATION_OPTIONS.map((option) => {
                const selected = selectedLimitations.includes(option);
                return (
                  <TouchableOpacity key={option} style={styles.limitationCheckRow} onPress={() => toggleLimitation(option)} activeOpacity={0.7}>
                    <View style={[styles.checkboxOuter, selected && styles.checkboxSelected]}>{selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}</View>
                    <Text style={styles.limitationOptionText}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
              {selectedLimitations.includes('Other') && (
                <TextInput style={styles.otherLimitationInput} placeholder="Describe other limitation..." placeholderTextColor="#9ca3af" value={otherLimitationText} onChangeText={setOtherLimitationText} selectionColor="#09AEC3" />
              )}
            </ScrollView>
          </View>
        )}

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
  container: { backgroundColor: '#041527', paddingHorizontal: 24, paddingVertical: 40, alignItems: 'center', flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 8 },
  backButton: { padding: 4 },
  backButtonIcon: { width: 24, height: 24 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  progress: { fontSize: 14, fontWeight: '600', color: '#FFF', opacity: 0.5 },
  progressBarBackground: { width: '100%', height: 4, backgroundColor: '#073741', borderRadius: 4, marginBottom: 32 },
  progressBarFill: { height: 4, backgroundColor: '#09AEC3', width: '25%', borderRadius: 4 },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  sectionSubtitle: { color: '#FFF', fontSize: 12, maxWidth: 320, marginBottom: 20, textAlign: 'center' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderColor: '#09AEC3', borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, marginBottom: 16, height: 40, maxWidth: 320, width: '100%' },
  icon: { marginRight: 8 },
  input: { flex: 1, color: '#FFF', fontSize: 14, paddingVertical: 0 },
  genderLabel: { color: '#FFF', fontWeight: '700', marginTop: 20, marginBottom: 8 },
  genderOptions: { flexDirection: 'row', justifyContent: 'center', columnGap: 24, marginBottom: 32, width: '100%', maxWidth: 320 },
  genderOption: { flexDirection: 'row', alignItems: 'center' },
  radioCircle: { height: 18, width: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#09AEC3', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  radioCircleSelected: { borderColor: '#09AEC3' },
  radioInnerCircle: { height: 10, width: 10, borderRadius: 5, backgroundColor: '#09AEC3' },
  genderOptionText: { color: '#FFF', fontSize: 14 },
  limitationsLabelWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  limitationsLabel: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  limitationsDropdownTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: '#09AEC3', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, maxWidth: 320, width: '100%', minHeight: 48 },
  limitationsDropdownTriggerText: { color: '#FFF', fontSize: 14, flex: 1 },
  limitationsDropdownBox: { borderColor: '#09AEC3', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 24, maxWidth: 320, width: '100%', maxHeight: 280 },
  limitationsDropdownScroll: { maxHeight: 256 },
  limitationCheckRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  checkboxOuter: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#09AEC3', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkboxSelected: { backgroundColor: '#09AEC3' },
  limitationOptionText: { color: '#FFF', fontSize: 14, flex: 1 },
  otherLimitationInput: { borderColor: '#073741', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#FFF', fontSize: 14, marginTop: 8, width: '100%' },
  nextButton: { backgroundColor: '#09AEC3', height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', maxWidth: 260, width: '85%', alignSelf: 'center' },
  nextButtonText: { color: '#FFF', fontWeight: '700', fontSize: 18 },
  errorContainer: { width: '100%', maxWidth: 320, marginTop: -12, marginBottom: 8, paddingLeft: 12 },
  errorText: { color: '#FF4444', fontSize: 12 },
});

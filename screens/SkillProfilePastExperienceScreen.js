import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSkillProfile } from '../lib/contexts/SkillProfileContext';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

const EXPERIENCE_LEVELS = [
  { title: 'Complete Beginner', subtitle: 'New to Self Defense' },
  { title: 'Some Experience', subtitle: 'Basic Knowledge' },
  { title: 'Experienced', subtitle: 'Regular Training' },
  { title: 'Expert/Instructor', subtitle: 'Teaching Others' },
];
const MARTIAL_ARTS_OPTIONS = ['Boxing', 'Brazilian Jiu-Jitsu (BJJ)', 'MMA (Mixed Martial Arts)', 'Taekwondo (TKD)', 'Muay Thai', 'Wushu', 'Karate', 'Judo', 'Wrestling', 'Kickboxing', 'Krav Maga', 'Aikido', 'Capoeira', 'Kung Fu', 'Jiu-Jitsu', 'Sambo', 'Savate', 'Other'];
const EXPERIENCE_DURATIONS = ['None', '1-6 months', '7-12 months', '1-2 years', '3-5 years', '5-10 years', 'Over 10 years'];

export default function SkillProfilePastExperienceScreen({ onNext, onBack }) {
  const { setPastExperience, pastExperience } = useSkillProfile();
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();
  const [selectedExperience, setSelectedExperience] = useState(pastExperience?.experienceLevel || null);
  const [selectedMartialArts, setSelectedMartialArts] = useState(
    Array.isArray(pastExperience?.martialArtsBackground) ? pastExperience.martialArtsBackground : (pastExperience?.martialArtsBackground ? [pastExperience.martialArtsBackground] : [])
  );
  const [hasNoMartialArts, setHasNoMartialArts] = useState(!pastExperience?.martialArtsBackground?.length);
  const [selectedDuration, setSelectedDuration] = useState(pastExperience?.previousTrainingDetails || null);
  const [errors, setErrors] = useState({ experience: '', martialArt: '', duration: '' });

  const handleBack = () => {
    setPastExperience({
      experienceLevel: selectedExperience || '',
      martialArtsBackground: hasNoMartialArts ? [] : selectedMartialArts,
      previousTrainingDetails: selectedDuration || undefined,
    });
    onBack();
  };

  const handleNext = () => {
    const experienceError = !selectedExperience ? 'Please select an experience level' : '';
    const martialArtError = !hasNoMartialArts && selectedMartialArts.length === 0 ? 'Please select at least one martial arts background or select None' : '';
    const durationError = !selectedDuration ? 'Please select an experience duration' : '';
    setErrors({ experience: experienceError, martialArt: martialArtError, duration: durationError });
    if (experienceError || martialArtError || durationError) {
      showToast('Invalid inputs. Try again');
      return;
    }
    setPastExperience({
      experienceLevel: selectedExperience,
      martialArtsBackground: hasNoMartialArts ? [] : selectedMartialArts,
      previousTrainingDetails: selectedDuration || undefined,
    });
    onNext();
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backRow}>
            <Ionicons name="arrow-back" size={20} color="#09AEC3" />
            <Text style={styles.backText}>Past Experience</Text>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Setup Profile</Text>
            <Text style={styles.progress}>3 of 4</Text>
          </View>
        </View>
        <View style={styles.progressBarBackground}>
          <View style={styles.progressBarFill} />
        </View>
        <Text style={styles.subTitleText}>Tell us about your training background</Text>
        <Text style={styles.sectionTitle}>Experience Level</Text>
        <View style={styles.optionsContainer}>
          {EXPERIENCE_LEVELS.map(({ title, subtitle }) => {
            const selected = selectedExperience === title;
            return (
              <TouchableOpacity key={title} style={styles.optionRow} onPress={() => { setSelectedExperience(title); setErrors((e) => ({ ...e, experience: '' })); }} activeOpacity={0.7}>
                <View style={[styles.radioOuterCircle, selected && styles.radioCircleSelected]}>{selected && <View style={styles.radioInnerCircle} />}</View>
                <View>
                  <Text style={styles.optionTitle}>{title}</Text>
                  <Text style={styles.optionSubtitle}>{subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.experience ? <Text style={styles.errorText}>{errors.experience}</Text> : null}
        <Text style={styles.sectionTitle}>Martial Arts Background</Text>
        <TouchableOpacity style={styles.noneOptionRow} onPress={() => { setHasNoMartialArts(!hasNoMartialArts); if (!hasNoMartialArts) setSelectedMartialArts([]); setErrors((e) => ({ ...e, martialArt: '' })); }} activeOpacity={0.7}>
          <View style={[styles.checkboxOuter, hasNoMartialArts && styles.checkboxSelected]}>{hasNoMartialArts && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}</View>
          <Text style={styles.noneOptionText}>None</Text>
        </TouchableOpacity>
        {!hasNoMartialArts && (
          <View style={styles.optionsContainer}>
            {MARTIAL_ARTS_OPTIONS.map((art) => {
              const selected = selectedMartialArts.includes(art);
              return (
                <TouchableOpacity key={art} style={styles.optionRow} onPress={() => { if (selected) setSelectedMartialArts(selectedMartialArts.filter((a) => a !== art)); else setSelectedMartialArts([...selectedMartialArts, art]); setErrors((e) => ({ ...e, martialArt: '' })); }} activeOpacity={0.7}>
                  <View style={[styles.checkboxOuter, selected && styles.checkboxSelected]}>{selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}</View>
                  <Text style={styles.optionTitle}>{art}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {errors.martialArt ? <Text style={styles.errorText}>{errors.martialArt}</Text> : null}
        <Text style={styles.sectionTitle}>Martial Arts Experience Duration</Text>
        <View style={styles.optionsContainer}>
          {EXPERIENCE_DURATIONS.map((duration) => {
            const selected = selectedDuration === duration;
            return (
              <TouchableOpacity key={duration} style={styles.optionRow} onPress={() => { setSelectedDuration(duration); setErrors((e) => ({ ...e, duration: '' })); }} activeOpacity={0.7}>
                <View style={[styles.radioOuterCircle, selected && styles.radioCircleSelected]}>{selected && <View style={styles.radioInnerCircle} />}</View>
                <Text style={styles.optionTitle}>{duration}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.duration ? <Text style={styles.errorText}>{errors.duration}</Text> : null}
        <TouchableOpacity style={styles.nextButton} activeOpacity={0.7} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Next</Text>
        </TouchableOpacity>
      </ScrollView>
      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#041527' },
  container: { backgroundColor: '#041527', paddingHorizontal: 24, paddingVertical: 40, alignItems: 'center', flexGrow: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 8 },
  headerRight: { alignItems: 'flex-end' },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', marginLeft: 8 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold' },
  progress: { color: '#FFFFFF', fontSize: 14, opacity: 0.6 },
  progressBarBackground: { width: '100%', height: 4, backgroundColor: '#073741', borderRadius: 4, marginBottom: 32 },
  progressBarFill: { height: 4, backgroundColor: '#09AEC3', width: '75%', borderRadius: 4 },
  subTitleText: { color: '#FFFFFF', fontSize: 14, marginBottom: 24, textAlign: 'center' },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  optionsContainer: { marginBottom: 32, width: '100%', maxWidth: 320 },
  optionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  radioOuterCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#09AEC3', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  radioCircleSelected: { borderColor: '#09AEC3' },
  radioInnerCircle: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#09AEC3' },
  checkboxOuter: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#09AEC3', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  checkboxSelected: { borderColor: '#09AEC3', backgroundColor: '#09AEC3' },
  optionTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  optionSubtitle: { color: '#cccccc', fontSize: 13 },
  noneOptionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, width: '100%', maxWidth: 320 },
  noneOptionText: { color: '#FFFFFF', fontSize: 14 },
  nextButton: { backgroundColor: '#09AEC3', paddingVertical: 12, borderRadius: 25, width: 180, alignSelf: 'center', alignItems: 'center' },
  nextButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  errorText: { color: '#FF4444', fontSize: 12, marginTop: -8, marginBottom: 8, alignSelf: 'center', maxWidth: 320 },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AuthController } from '../lib/controllers/AuthController';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

const categories = ['Punching', 'Kicking', 'Palm Strikes', 'Elbow Strikes', 'Knee Strikes', 'Defensive Moves'];

const physicalDemandTags = [
  'Flexibility', 'Strength', 'Endurance', 'Balance', 'Coordination', 'Speed', 'Agility', 'Power',
];

const spaceOptions = ['Small space', 'Medium space', 'Large space', 'Outdoor', 'Indoor'];

const repRangeOptions = ['4-6 reps', '8-10 reps', '12 reps', '15 reps'];

const trainingDurationOptions: { label: string; value: number }[] = [
  { label: '30 sec', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '3 min', value: 180 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '15 min', value: 900 },
];

interface PublishModuleScreenProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function PublishModuleScreen({ onBack, onSuccess }: PublishModuleScreenProps) {
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [moduleTitle, setModuleTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [introductionType, setIntroductionType] = useState<'text' | 'video'>('text');
  const [introduction, setIntroduction] = useState('');
  const [introductionVideoUri, setIntroductionVideoUri] = useState<string | null>(null);
  const [introductionVideoName, setIntroductionVideoName] = useState('');
  const [videoLink, setVideoLink] = useState('');
  const [techniqueVideoFile, setTechniqueVideoFile] = useState<{ uri: string; name: string } | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [intensityLevel, setIntensityLevel] = useState(2);
  const [spaceRequirements, setSpaceRequirements] = useState<string[]>([]);
  const [physicalTags, setPhysicalTags] = useState<string[]>([]);
  const [repRange, setRepRange] = useState('');
  const [showRepPicker, setShowRepPicker] = useState(false);
  const [trainingDuration, setTrainingDuration] = useState<number | ''>('');
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [certificationChecked, setCertificationChecked] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await AuthController.getCurrentUser();
        if (cancelled) return;
        if (!user) {
          showToast('Please log in to publish modules');
          onBack();
          return;
        }
        if (user.role !== 'trainer' || !user.trainerApproved) {
          showToast('Only certified trainers can publish modules');
          onBack();
          return;
        }
      } catch (e) {
        if (!cancelled) showToast('Failed to verify trainer status');
        onBack();
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onBack, showToast]);

  const toggleSpace = (s: string) => {
    setSpaceRequirements((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };
  const togglePhysical = (t: string) => {
    setPhysicalTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const pickIntroductionVideo = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your gallery to pick a video.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 300,
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = (asset as any).fileName || uri.split('/').pop() || 'intro.mp4';
      if (fileName.toLowerCase().endsWith('.mp4') || (asset as any).mimeType?.includes('mp4')) {
        setIntroductionVideoUri(uri);
        setIntroductionVideoName(fileName);
        setErrors((e) => ({ ...e, introduction: '' }));
      } else {
        showToast('Please pick an MP4 video.');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to pick video.');
    }
  }, [showToast]);

  const pickTechniqueVideoFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/mp4',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      setTechniqueVideoFile({ uri: a.uri, name: a.name || 'video.mp4' });
      setErrors((e) => ({ ...e, video: '' }));
    } catch (err) {
      console.error(err);
      showToast('Failed to pick file. Use MP4 only.');
    }
  }, [showToast]);

  const pickThumbnailFromGallery = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your gallery to pick an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setThumbnailUri(result.assets[0].uri);
    } catch (err) {
      console.error(err);
      showToast('Failed to pick image.');
    }
  }, [showToast]);

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    const titleError = !moduleTitle.trim() ? 'Module title is required' : '';
    const descError = !description.trim() ? 'Description is required' : '';
    const catError = !category ? 'Category is required' : '';
    const introError =
      introductionType === 'text'
        ? !introduction.trim()
          ? 'Introduction is required'
          : ''
        : !introductionVideoUri
          ? 'Pick an introduction video (MP4) from gallery'
          : '';
    const videoError =
      !videoLink.trim() && !techniqueVideoFile ? 'Add a video link or pick an MP4 file' : '';
    const certError = !certificationChecked ? 'You must certify the technique' : '';
    setErrors({
      moduleTitle: titleError,
      description: descError,
      category: catError,
      introduction: introError,
      video: videoError,
      certification: certError,
    });
    if (titleError || descError || catError || introError || videoError || certError) {
      showToast('Please complete all required fields');
      return;
    }
    setLoading(true);
    try {
      const user = await AuthController.getCurrentUser();
      if (!user) {
        showToast('Please log in to publish modules');
        setLoading(false);
        return;
      }
      let introductionVideoUrl: string | undefined;
      let techniqueVideoUrl: string | undefined;
      let thumbnailUploadUrl: string | undefined;

      if (introductionType === 'video' && introductionVideoUri) {
        showToast('Uploading introduction video...');
        introductionVideoUrl = await AuthController.uploadFileToCloudinary(
          introductionVideoUri,
          'video',
          introductionVideoName || 'intro.mp4'
        );
      }
      if (techniqueVideoFile) {
        showToast('Uploading technique video...');
        techniqueVideoUrl = await AuthController.uploadFileToCloudinary(
          techniqueVideoFile.uri,
          'video',
          techniqueVideoFile.name
        );
      }
      if (thumbnailUri) {
        showToast('Uploading thumbnail...');
        thumbnailUploadUrl = await AuthController.uploadFileToCloudinary(
          thumbnailUri,
          'image',
          'thumbnail.jpg'
        );
      }

      showToast('Saving module...');
      const moduleData = {
        trainerId: user.uid,
        moduleTitle: moduleTitle.trim(),
        description: description.trim(),
        category,
        introductionType,
        introduction: introductionType === 'text' ? introduction.trim() : undefined,
        introductionVideoUrl: introductionType === 'video' ? introductionVideoUrl : undefined,
        techniqueVideoUrl,
        techniqueVideoLink: videoLink.trim() || undefined,
        thumbnailUrl: thumbnailUploadUrl || thumbnailUrl.trim() || undefined,
        intensityLevel,
        spaceRequirements: spaceRequirements.length ? spaceRequirements : [],
        physicalDemandTags: physicalTags.length ? physicalTags : [],
        repRange: repRange || undefined,
        trainingDurationSeconds: trainingDuration === '' ? undefined : trainingDuration,
        status: 'pending review' as const,
        certificationChecked,
      };
      await AuthController.saveModule(moduleData, false);
      showToast('Module submitted. Please wait for approval.');
      setTimeout(() => onSuccess(), 1500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to publish module';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }, [
    loading,
    moduleTitle,
    description,
    category,
    introductionType,
    introduction,
    introductionVideoUri,
    introductionVideoName,
    videoLink,
    techniqueVideoFile,
    thumbnailUri,
    thumbnailUrl,
    intensityLevel,
    spaceRequirements,
    physicalTags,
    repRange,
    trainingDuration,
    certificationChecked,
    showToast,
    onSuccess,
  ]);

  if (checking) {
    return (
      <View style={[styles.centered, styles.safe]}>
        <ActivityIndicator size="large" color="#07bbc0" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Image source={require('../assets/images/icon-back.png')} style={styles.backIcon} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Publish Module</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <Text style={styles.intro}>Create a new training module for review. Fill in all required fields.</Text>

          <Text style={styles.label}>Module title *</Text>
          <TextInput
            style={[styles.input, errors.moduleTitle ? styles.inputError : null]}
            placeholder="e.g. Basic Jab Cross"
            placeholderTextColor="#6b8693"
            value={moduleTitle}
            onChangeText={(t) => { setModuleTitle(t); if (errors.moduleTitle) setErrors((e) => ({ ...e, moduleTitle: '' })); }}
          />
          {errors.moduleTitle ? <Text style={styles.errorText}>{errors.moduleTitle}</Text> : null}

          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.multiline, errors.description ? styles.inputError : null]}
            placeholder="Describe the technique and what learners will practice"
            placeholderTextColor="#6b8693"
            value={description}
            onChangeText={(t) => { setDescription(t); if (errors.description) setErrors((e) => ({ ...e, description: '' })); }}
            multiline
          />
          {errors.description ? <Text style={styles.errorText}>{errors.description}</Text> : null}

          <Text style={styles.label}>Category *</Text>
          <TouchableOpacity
            style={[styles.selectBtn, errors.category ? styles.inputError : null]}
            onPress={() => setShowCategoryPicker(!showCategoryPicker)}
          >
            <Text style={category ? styles.selectText : styles.placeholderText}>{category || 'Select category'}</Text>
            <Text style={styles.chevron}>▼</Text>
          </TouchableOpacity>
          {showCategoryPicker && (
            <View style={styles.pickerList}>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={styles.pickerItem}
                  onPress={() => { setCategory(c); setShowCategoryPicker(false); setErrors((e) => ({ ...e, category: '' })); }}
                >
                  <Text style={styles.pickerItemText}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {errors.category ? <Text style={styles.errorText}>{errors.category}</Text> : null}

          <Text style={styles.label}>Introduction *</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.toggleBtn, introductionType === 'text' && styles.toggleBtnActive]}
              onPress={() => { setIntroductionType('text'); setIntroductionVideoUri(null); setIntroductionVideoName(''); setErrors((e) => ({ ...e, introduction: '' })); }}
            >
              <Text style={[styles.toggleBtnText, introductionType === 'text' && styles.toggleBtnTextActive]}>Text</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, introductionType === 'video' && styles.toggleBtnActive]}
              onPress={() => { setIntroductionType('video'); setIntroduction(''); setErrors((e) => ({ ...e, introduction: '' })); }}
            >
              <Text style={[styles.toggleBtnText, introductionType === 'video' && styles.toggleBtnTextActive]}>Video</Text>
            </TouchableOpacity>
          </View>
          {introductionType === 'text' ? (
            <>
              <TextInput
                style={[styles.input, styles.multiline, errors.introduction ? styles.inputError : null]}
                placeholder="Brief intro to the technique"
                placeholderTextColor="#6b8693"
                value={introduction}
                onChangeText={(t) => { setIntroduction(t); if (errors.introduction) setErrors((e) => ({ ...e, introduction: '' })); }}
                multiline
              />
              {errors.introduction ? <Text style={styles.errorText}>{errors.introduction}</Text> : null}
            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.uploadBtn, errors.introduction ? styles.inputError : null]} onPress={pickIntroductionVideo}>
                <Text style={styles.uploadBtnIcon}>🎬</Text>
                <Text style={styles.uploadBtnText}>{introductionVideoUri ? introductionVideoName : 'Pick video from gallery (MP4)'}</Text>
              </TouchableOpacity>
              {introductionVideoUri && (
                <TouchableOpacity onPress={() => { setIntroductionVideoUri(null); setIntroductionVideoName(''); }} style={styles.removeFile}>
                  <Text style={styles.removeFileText}>Remove video</Text>
                </TouchableOpacity>
              )}
              {errors.introduction ? <Text style={styles.errorText}>{errors.introduction}</Text> : null}
            </>
          )}

          <Text style={styles.label}>Technique video * (link or MP4 file)</Text>
          <TextInput
            style={[styles.input, errors.video && !techniqueVideoFile ? styles.inputError : null]}
            placeholder="Paste video link (or add file below)"
            placeholderTextColor="#6b8693"
            value={videoLink}
            onChangeText={(t) => { setVideoLink(t); if (errors.video) setErrors((e) => ({ ...e, video: '' })); }}
            keyboardType="url"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.uploadBtn} onPress={pickTechniqueVideoFile}>
            <Text style={styles.uploadBtnIcon}>📁</Text>
            <Text style={styles.uploadBtnText}>{techniqueVideoFile ? techniqueVideoFile.name : 'Add MP4 file'}</Text>
          </TouchableOpacity>
          {techniqueVideoFile && (
            <TouchableOpacity onPress={() => setTechniqueVideoFile(null)} style={styles.removeFile}>
              <Text style={styles.removeFileText}>Remove file</Text>
            </TouchableOpacity>
          )}
          {errors.video ? <Text style={styles.errorText}>{errors.video}</Text> : null}

          <Text style={styles.label}>Thumbnail (optional)</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={pickThumbnailFromGallery}>
            <Text style={styles.uploadBtnIcon}>🖼</Text>
            <Text style={styles.uploadBtnText}>{thumbnailUri ? 'Image selected' : 'Pick from gallery'}</Text>
          </TouchableOpacity>
          {thumbnailUri && (
            <TouchableOpacity onPress={() => setThumbnailUri(null)} style={styles.removeFile}>
              <Text style={styles.removeFileText}>Remove image</Text>
            </TouchableOpacity>
          )}
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="Or paste thumbnail image URL"
            placeholderTextColor="#6b8693"
            value={thumbnailUrl}
            onChangeText={setThumbnailUrl}
            keyboardType="url"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Intensity (1–5)</Text>
          <View style={styles.intensityRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.intensityBtn, intensityLevel === n && styles.intensityBtnActive]}
                onPress={() => setIntensityLevel(n)}
              >
                <Text style={[styles.intensityBtnText, intensityLevel === n && styles.intensityBtnTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Space requirements (optional)</Text>
          <View style={styles.chipRow}>
            {spaceOptions.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, spaceRequirements.includes(s) && styles.chipActive]}
                onPress={() => toggleSpace(s)}
              >
                <Text style={[styles.chipText, spaceRequirements.includes(s) && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Physical demand (optional)</Text>
          <View style={styles.chipRow}>
            {physicalDemandTags.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, physicalTags.includes(t) && styles.chipActive]}
                onPress={() => togglePhysical(t)}
              >
                <Text style={[styles.chipText, physicalTags.includes(t) && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Rep range (optional)</Text>
          <TouchableOpacity style={styles.selectBtn} onPress={() => setShowRepPicker(!showRepPicker)}>
            <Text style={repRange ? styles.selectText : styles.placeholderText}>{repRange || 'Select'}</Text>
            <Text style={styles.chevron}>▼</Text>
          </TouchableOpacity>
          {showRepPicker && (
            <View style={styles.pickerList}>
              {repRangeOptions.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={styles.pickerItem}
                  onPress={() => { setRepRange(r); setShowRepPicker(false); }}
                >
                  <Text style={styles.pickerItemText}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.label}>Training duration (optional)</Text>
          <TouchableOpacity style={styles.selectBtn} onPress={() => setShowDurationPicker(!showDurationPicker)}>
            <Text style={trainingDuration !== '' ? styles.selectText : styles.placeholderText}>
              {trainingDuration !== '' ? trainingDurationOptions.find((o) => o.value === trainingDuration)?.label ?? `${trainingDuration}s` : 'Select'}
            </Text>
            <Text style={styles.chevron}>▼</Text>
          </TouchableOpacity>
          {showDurationPicker && (
            <View style={styles.pickerList}>
              {trainingDurationOptions.map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={styles.pickerItem}
                  onPress={() => { setTrainingDuration(o.value); setShowDurationPicker(false); }}
                >
                  <Text style={styles.pickerItemText}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => { setCertificationChecked(!certificationChecked); setErrors((e) => ({ ...e, certification: '' })); }}
          >
            <View style={[styles.checkbox, certificationChecked && styles.checkboxChecked]}>
              {certificationChecked ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <Text style={styles.checkLabel}>I certify that this technique is safe and appropriate for the intended audience</Text>
          </TouchableOpacity>
          {errors.certification ? <Text style={styles.errorText}>{errors.certification}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color="#041527" /> : <Text style={styles.submitBtnText}>Submit for review</Text>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#041527' },
  flex: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 28,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#062731',
    backgroundColor: '#041527',
  },
  backBtn: { padding: 8, marginRight: 8 },
  backIcon: { width: 24, height: 24, tintColor: '#fff' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#FFF' },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  intro: { fontSize: 14, color: '#8fa3b0', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#FFF', marginBottom: 8 },
  input: {
    backgroundColor: '#011f36',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0a3645',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFF',
    minHeight: 48,
    marginBottom: 16,
  },
  inputError: { borderColor: '#FF6B6B' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  errorText: { color: '#FF6B6B', fontSize: 12, marginTop: -8, marginBottom: 8 },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#011f36',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0a3645',
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 48,
    marginBottom: 16,
  },
  selectText: { color: '#FFF', fontSize: 16, flex: 1 },
  placeholderText: { color: '#6b8693', fontSize: 16, flex: 1 },
  chevron: { color: '#07bbc0', fontSize: 12 },
  pickerList: { backgroundColor: '#011f36', borderRadius: 8, borderWidth: 1, borderColor: '#0a3645', marginBottom: 16 },
  pickerItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#0a3645' },
  pickerItemText: { color: '#FFF', fontSize: 15 },
  intensityRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  intensityBtn: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#011f36', borderWidth: 1, borderColor: '#0a3645', justifyContent: 'center', alignItems: 'center' },
  intensityBtnActive: { backgroundColor: '#07bbc0', borderColor: '#07bbc0' },
  intensityBtnText: { color: '#8fa3b0', fontSize: 18, fontWeight: '700' },
  intensityBtnTextActive: { color: '#041527' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#011f36', borderWidth: 1, borderColor: '#0a3645' },
  chipActive: { backgroundColor: 'rgba(7,187,192,0.3)', borderColor: '#07bbc0' },
  chipText: { color: '#8fa3b0', fontSize: 13 },
  chipTextActive: { color: '#FFF' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  toggleBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#011f36', borderWidth: 1, borderColor: '#0a3645' },
  toggleBtnActive: { backgroundColor: '#07bbc0', borderColor: '#07bbc0' },
  toggleBtnText: { color: '#8fa3b0', fontSize: 15, fontWeight: '600' },
  toggleBtnTextActive: { color: '#041527' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: '#07bbc0', backgroundColor: '#011f36', marginBottom: 8 },
  uploadBtnIcon: { fontSize: 20, marginRight: 8 },
  uploadBtnText: { color: '#07bbc0', fontSize: 15, fontWeight: '600' },
  removeFile: { marginBottom: 12 },
  removeFileText: { color: '#FF6B6B', fontSize: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: '#07bbc0', marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#07bbc0' },
  check: { color: '#041527', fontSize: 14, fontWeight: '700' },
  checkLabel: { color: '#FFF', fontSize: 14, flex: 1 },
  submitBtn: { backgroundColor: '#07bbc0', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 54 },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#041527', fontSize: 16, fontWeight: '700' },
});

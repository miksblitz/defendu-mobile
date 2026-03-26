/**
 * PublishModuleScreen
 * Trainers create/publish training modules: title, category, media, technique, rep range, etc.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as RN from 'react-native';

const {
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
  Animated,
  Dimensions,
  Easing,
} = RN;
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';

// --- Constants ---
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_DURATION = 280;
import { AuthController } from '../lib/controllers/AuthController';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

const categories = ['Punching', 'Kicking', 'Elbow Strikes', 'Knee Strikes', 'Defensive Moves'];

const physicalDemandTags = [
  'Flexibility', 'Strength', 'Endurance', 'Balance', 'Coordination', 'Speed', 'Agility', 'Power',
];

const spaceOptions = ['Small space', 'Medium space', 'Large space', 'Outdoor', 'Indoor'];

/** Warmup options; can be filtered by category (e.g. Punching → upper body, Kicking → lower body). */
const warmupOptionsByCategory: Record<string, string[]> = {
  'Punching': ['ARM CIRCLES', 'HIP CIRCLES', 'LEG SWINGS', 'MARCH -OR- JOG IN PLACE', 'JUMPING JACKS', 'BODYWEIGHT SQUATS', 'REGULAR PUSH-UPS', 'LUNGES'],
  'Kicking': ['ARM CIRCLES', 'HIP CIRCLES', 'LEG SWINGS', 'MARCH -OR- JOG IN PLACE', 'JUMPING JACKS', 'BODYWEIGHT SQUATS', 'REGULAR PUSH-UPS', 'LUNGES'],
  'Elbow Strikes': ['ARM CIRCLES', 'HIP CIRCLES', 'LEG SWINGS', 'MARCH -OR- JOG IN PLACE', 'JUMPING JACKS', 'BODYWEIGHT SQUATS', 'REGULAR PUSH-UPS', 'LUNGES'],
  'Knee Strikes': ['ARM CIRCLES', 'HIP CIRCLES', 'LEG SWINGS', 'MARCH -OR- JOG IN PLACE', 'JUMPING JACKS', 'BODYWEIGHT SQUATS', 'REGULAR PUSH-UPS', 'LUNGES'],
  'Defensive Moves': ['ARM CIRCLES', 'HIP CIRCLES', 'LEG SWINGS', 'MARCH -OR- JOG IN PLACE', 'JUMPING JACKS', 'BODYWEIGHT SQUATS', 'REGULAR PUSH-UPS', 'LUNGES'],
};
const defaultWarmupOptions = warmupOptionsByCategory['Punching'];

const cooldownOptions = [
  'Shoulder stretch',
  'Standing sidestretch',
  'Knee hug',
  'Quad stretch',
  'Standing hamstring stretch',
];

const repRangeOptions = ['4-6 reps', '8-10 reps', '12 reps', '15 reps'];

const difficultyOptions: { label: string; value: 'basic' | 'intermediate' | 'advanced' }[] = [
  { label: 'Basic', value: 'basic' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
];

const trainingDurationOptions: { label: string; value: number }[] = [
  { label: '30 sec', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '3 min', value: 180 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '15 min', value: 900 },
];

// --- Types ---
interface PublishModuleScreenProps {
  onBack: () => void;
  onSuccess: (toastMessage?: string) => void;
}

// --- Component ---
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
  const [techniqueVideoFile, setTechniqueVideoFile] = useState<{ uri: string; name: string } | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [intensityLevel, setIntensityLevel] = useState(2);
  const [spaceRequirements, setSpaceRequirements] = useState<string[]>([]);
  const [warmupExercises, setWarmupExercises] = useState<string[]>([]);
  const [showWarmupDropdown, setShowWarmupDropdown] = useState(false);
  const [cooldownExercises, setCooldownExercises] = useState<string[]>([]);
  const [showCooldownDropdown, setShowCooldownDropdown] = useState(false);
  const [physicalTags, setPhysicalTags] = useState<string[]>([]);
  const [repRange, setRepRange] = useState('');
  const [showRepPicker, setShowRepPicker] = useState(false);
  const [difficultyLevel, setDifficultyLevel] = useState<'basic' | 'intermediate' | 'advanced' | ''>('');
  const [showDifficultyPicker, setShowDifficultyPicker] = useState(false);
  const [trainingDuration, setTrainingDuration] = useState<number | ''>('');
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [certificationChecked, setCertificationChecked] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const directionRef = useRef<'forward' | 'back'>('forward');
  const prevStepRef = useRef(1);

  useEffect(() => {
    if (prevStepRef.current === step) return;
    const fromX = directionRef.current === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH;
    slideAnim.setValue(fromX);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start(() => {
      prevStepRef.current = step;
    });
  }, [step, slideAnim]);

  const goToStep = useCallback((nextStep: number, direction: 'forward' | 'back') => {
    directionRef.current = direction;
    setStep(nextStep);
  }, []);

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
  const warmupOptions = category ? (warmupOptionsByCategory[category] ?? defaultWarmupOptions) : defaultWarmupOptions;
  const toggleWarmup = (w: string) => {
    setWarmupExercises((prev) => {
      if (prev.includes(w)) return prev.filter((x) => x !== w);
      if (prev.length >= 3) {
        showToast('Warmup: please select exactly 3');
        return prev;
      }
      return [...prev, w];
    });
    if (errors.warmupExercises) setErrors((e) => ({ ...e, warmupExercises: '' }));
  };
  const toggleCooldown = (c: string) => {
    setCooldownExercises((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c);
      if (prev.length >= 3) {
        showToast('Cooldown: please select exactly 3');
        return prev;
      }
      return [...prev, c];
    });
    if (errors.cooldownExercises) setErrors((e) => ({ ...e, cooldownExercises: '' }));
  };
  const togglePhysical = (t: string) => {
    setPhysicalTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const takeIntroductionVideo = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to record a video.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 300,
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = (asset as any).fileName || uri.split('/').pop() || 'intro.mp4';
      setIntroductionVideoUri(uri);
      setIntroductionVideoName(fileName);
      setErrors((e) => ({ ...e, introduction: '' }));
    } catch (err) {
      console.error(err);
      showToast('Failed to record video.');
    }
  }, [showToast]);

  const pickIntroductionVideo = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your gallery to pick a video.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
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

  const takeTechniqueVideo = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to record the technique video.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 300,
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = (asset as any).fileName || uri.split('/').pop() || 'technique.mp4';
      setTechniqueVideoFile({ uri, name: fileName });
      setErrors((e) => ({ ...e, video: '' }));
    } catch (err) {
      console.error(err);
      showToast('Failed to record video.');
    }
  }, [showToast]);

  const pickTechniqueVideoFromGallery = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your gallery to pick a video.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 300,
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = (asset as any).fileName || uri.split('/').pop() || 'technique.mp4';
      setTechniqueVideoFile({ uri, name: fileName });
      setErrors((e) => ({ ...e, video: '' }));
    } catch (err) {
      console.error(err);
      showToast('Failed to pick video.');
    }
  }, [showToast]);

  const takeThumbnailPhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to take a thumbnail photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setThumbnailUri(result.assets[0].uri);
      setErrors((e) => ({ ...e, thumbnail: '' }));
    } catch (err) {
      console.error(err);
      showToast('Failed to take photo.');
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
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setThumbnailUri(result.assets[0].uri);
      setErrors((e) => ({ ...e, thumbnail: '' }));
    } catch (err) {
      console.error(err);
      showToast('Failed to pick image.');
    }
  }, [showToast]);

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    // Enhanced validation logic (mirroring web)
    const titleError = !moduleTitle.trim()
      ? 'Please fill this in'
      : moduleTitle.length > 50
        ? 'Module title must be 50 characters or less'
        : '';
    const descError = !description.trim()
      ? 'Please fill this in'
      : description.length > 600
        ? 'Description must be 600 characters or less'
        : '';
    const catError = !category ? 'Please select a category' : '';
    const introError =
      introductionType === 'text'
        ? !introduction.trim() ? 'Please fill this in or upload an introduction video' : ''
        : !introductionVideoUri ? 'Please upload an introduction video or add text' : '';
    const videoError = !techniqueVideoFile ? 'Please add technique video' : '';
    const warmupError = warmupExercises.length !== 3 ? 'Please select exactly 3 warmup exercises' : '';
    const cooldownError = cooldownExercises.length !== 3 ? 'Please select exactly 3 cooldown stretches' : '';
    const certError = !certificationChecked ? 'Please check this box to certify' : '';
    setErrors({
      moduleTitle: titleError,
      description: descError,
      category: catError,
      introduction: introError,
      video: videoError,
      thumbnail: '',
      warmupExercises: warmupError,
      cooldownExercises: cooldownError,
      certification: certError,
    });
    const hasFieldErrors = titleError || descError || catError || introError || videoError || warmupError || cooldownError;
    if (hasFieldErrors || certError) {
      // Build a guiding toast listing what's missing
      const missing: string[] = [];
      if (titleError) missing.push('Module title');
      if (descError) missing.push('Description');
      if (catError) missing.push('Category');
      if (introError) missing.push('Introduction');
      if (videoError) missing.push('Technique video');
      if (warmupError) missing.push('Warmup (pick 3)');
      if (cooldownError) missing.push('Cooldown (pick 3)');
      if (certError) missing.push('Certification box (check "I certify...")');
      const message = missing.length === 1
        ? `Please fill in: ${missing[0]}`
        : `Please complete: ${missing.join(', ')}`;
      showToast(message);
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
      // Save module to DB first (fast); then upload media and patch so UI feels responsive
      const moduleDataWithoutMedia = {
        trainerId: user.uid,
        moduleTitle: moduleTitle.trim(),
        description: description.trim(),
        category,
        introductionType,
        introduction: introductionType === 'text' ? introduction.trim() : undefined,
        introductionVideoUrl: undefined as string | undefined,
        techniqueVideoUrl: undefined as string | undefined,
        techniqueVideoUrl2: undefined as string | undefined,
        techniqueVideoLink: undefined as string | undefined,
        thumbnailUrl: undefined as string | undefined,
        referencePoseVideoUrlSide1: undefined as string | undefined,
        referencePoseVideoUrlSide2: undefined as string | undefined,
        intensityLevel,
        spaceRequirements: spaceRequirements.length ? spaceRequirements : [],
        warmupExercises: warmupExercises.length ? warmupExercises : [],
        cooldownExercises: cooldownExercises.length ? cooldownExercises : [],
        physicalDemandTags: physicalTags.length ? physicalTags : [],
        repRange: repRange || undefined,
        difficultyLevel: difficultyLevel || undefined,
        trainingDurationSeconds: trainingDuration === '' ? undefined : trainingDuration,
        status: 'pending review' as const,
        certificationChecked,
      };
      const moduleId = await AuthController.saveModule(moduleDataWithoutMedia, false);
      let techniqueVideoUrl: string | undefined;
      let introductionVideoUrl: string | undefined;
      let thumbnailUploadUrl: string | undefined;
      const uploadTasks: Promise<{ kind: 'technique' | 'intro' | 'thumbnail'; url: string }>[] = [];
      if (techniqueVideoFile) {
        uploadTasks.push(
          AuthController.uploadFileToCloudinary(techniqueVideoFile.uri, 'video', techniqueVideoFile.name)
            .then((url) => ({ kind: 'technique' as const, url }))
        );
      }
      if (introductionType === 'video' && introductionVideoUri) {
        uploadTasks.push(
          AuthController.uploadFileToCloudinary(introductionVideoUri, 'video', introductionVideoName || 'intro.mp4')
            .then((url) => ({ kind: 'intro' as const, url }))
        );
      }
      if (thumbnailUri) {
        uploadTasks.push(
          AuthController.uploadFileToCloudinary(thumbnailUri, 'image', 'thumbnail.jpg')
            .then((url) => ({ kind: 'thumbnail' as const, url }))
        );
      }
      try {
        const results = await Promise.all(uploadTasks);
        results.forEach((r) => {
          if (r.kind === 'technique') techniqueVideoUrl = r.url;
          else if (r.kind === 'intro') introductionVideoUrl = r.url;
          else if (r.kind === 'thumbnail') thumbnailUploadUrl = r.url;
        });
        await AuthController.updateModuleMedia(moduleId, {
          techniqueVideoUrl: techniqueVideoUrl ?? null,
          thumbnailUrl: thumbnailUploadUrl ?? null,
          referencePoseVideoUrlSide1: techniqueVideoUrl ?? null,
          introductionVideoUrl: introductionType === 'video' ? (introductionVideoUrl ?? null) : null,
        });
      } catch (error: any) {
        await AuthController.removeModule(moduleId).catch(() => {});
        const msg = error?.message || '';
        if (msg.toLowerCase().includes('video')) {
          showToast('Upload failed. Please try again.');
        } else if (msg.toLowerCase().includes('image') || msg.toLowerCase().includes('thumbnail')) {
          showToast('Thumbnail upload failed. Please try again.');
        } else {
          showToast('Upload failed. Please try again.');
        }
        setLoading(false);
        return;
      }
      // Reset form after success
      setModuleTitle('');
      setDescription('');
      setCategory('');
      setIntroduction('');
      setIntroductionType('text');
      setIntroductionVideoUri(null);
      setIntroductionVideoName('');
      setTechniqueVideoFile(null);
      setThumbnailUri(null);
      setIntensityLevel(2);
      setSpaceRequirements([]);
      setWarmupExercises([]);
      setCooldownExercises([]);
      setPhysicalTags([]);
      setRepRange('');
      setDifficultyLevel('');
      setTrainingDuration('');
      setCertificationChecked(false);
      setStep(1);
      onSuccess('Module submitted for review');
    } catch (error: any) {
      showToast(error?.message || 'Failed to publish module');
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
    techniqueVideoFile,
    thumbnailUri,
    intensityLevel,
    spaceRequirements,
    warmupExercises,
    cooldownExercises,
    physicalTags,
    repRange,
    difficultyLevel,
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

  if (loading) {
    return (
      <View style={[styles.centered, styles.safe]}>
        <ActivityIndicator size="large" color="#07bbc0" />
        <Text style={styles.submittingLabel}>Publishing module…</Text>
        <Text style={styles.submittingHint}>Please wait</Text>
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

        <View style={styles.stepContentClip}>
          <Animated.View style={[styles.stepContentWrap, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>
              {step === 1 && 'Title & introduction'}
              {step === 2 && 'Technique video'}
              {step === 3 && 'Thumbnail (optional)'}
              {step === 4 && 'Intensity & details'}
            </Text>
            <Text style={styles.stepCounter}>Step {step} of 4</Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
          {step === 1 && (
            <>
              <Text style={styles.intro}>Name your module and add a short introduction.</Text>
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
                  style={[styles.toggleBtn, introductionType === 'video' && styles.toggleBtnActive]}
                  onPress={() => { setIntroductionType('video'); setIntroduction(''); setErrors((e) => ({ ...e, introduction: '' })); }}
                >
                  <Text style={[styles.toggleBtnText, introductionType === 'video' && styles.toggleBtnTextActive]}>Video</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, introductionType === 'text' && styles.toggleBtnActive]}
                  onPress={() => { setIntroductionType('text'); setIntroductionVideoUri(null); setIntroductionVideoName(''); setErrors((e) => ({ ...e, introduction: '' })); }}
                >
                  <Text style={[styles.toggleBtnText, introductionType === 'text' && styles.toggleBtnTextActive]}>Text</Text>
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
              ) : introductionVideoUri ? (
                <>
                  <View style={styles.mediaPreviewWrap}>
                    <Video
                      source={{ uri: introductionVideoUri }}
                      style={styles.videoPreview}
                      resizeMode="contain"
                      useNativeControls
                    />
                  </View>
                  <Text style={styles.previewHint}>{introductionVideoName || 'Introduction video preview'}</Text>
                  <TouchableOpacity
                    onPress={() => { setIntroductionVideoUri(null); setIntroductionVideoName(''); }}
                    style={styles.removeFile}
                  >
                    <Text style={styles.removeFileText}>Remove video</Text>
                  </TouchableOpacity>
                  {errors.introduction ? <Text style={styles.errorText}>{errors.introduction}</Text> : null}
                </>
              ) : (
                <>
                  <TouchableOpacity style={[styles.uploadBtn, errors.introduction ? styles.inputError : null]} onPress={takeIntroductionVideo}>
                    <Text style={styles.uploadBtnIcon}>📹</Text>
                    <Text style={styles.uploadBtnText}>Take video</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.uploadBtn, errors.introduction ? styles.inputError : null]} onPress={pickIntroductionVideo}>
                    <Text style={styles.uploadBtnIcon}>🎬</Text>
                    <Text style={styles.uploadBtnText}>Choose from gallery</Text>
                  </TouchableOpacity>
                  {errors.introduction ? <Text style={styles.errorText}>{errors.introduction}</Text> : null}
                </>
              )}
              <View style={styles.step1NextWrap}>
                <TouchableOpacity
                  style={styles.nextBtnCentered}
                  onPress={() => {
                    const titleError = !moduleTitle.trim() ? 'Please fill this in' : moduleTitle.length > 50 ? 'Module title must be 50 characters or less' : '';
                    const descError = !description.trim() ? 'Please fill this in' : description.length > 600 ? 'Description must be 600 characters or less' : '';
                    const catError = !category ? 'Please select a category' : '';
                    const introError = introductionType === 'text' ? (!introduction.trim() ? 'Please fill this in or upload an introduction video' : '') : (!introductionVideoUri ? 'Please upload an introduction video or add text' : '');
                    setErrors((e) => ({ ...e, moduleTitle: titleError, description: descError, category: catError, introduction: introError }));
                    if (titleError || descError || catError || introError) {
                      showToast(titleError || descError || catError || introError);
                      return;
                    }
                    goToStep(2, 'forward');
                  }}
                >
                  <Text style={styles.nextBtnText}>Next</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.intro}>Add the technique video. Orthodox stance only, facing the camera.</Text>
              <View style={styles.rulesBox}>
                <Text style={styles.rulesTitle}>Recording rules</Text>
                <Text style={styles.rulesText}>• Orthodox stance only. No southpaw stance.</Text>
                <Text style={styles.rulesText}>• Face the camera with your torso and full body—camera must see your front (chest and arms toward the lens).</Text>
                <Text style={styles.rulesText}>• One clean rep. Good lighting and clear view of upper body.</Text>
              </View>
              <Text style={styles.label}>Technique video *</Text>
              {techniqueVideoFile ? (
                <>
                  <View style={styles.mediaPreviewWrap}>
                    <Video
                      source={{ uri: techniqueVideoFile.uri }}
                      style={styles.videoPreview}
                      resizeMode="contain"
                      useNativeControls
                    />
                  </View>
                  <Text style={styles.previewHint}>{techniqueVideoFile.name || 'Technique video preview'}</Text>
                  <TouchableOpacity onPress={() => setTechniqueVideoFile(null)} style={styles.removeFile}>
                    <Text style={styles.removeFileText}>Remove video</Text>
                  </TouchableOpacity>
                  {errors.video ? <Text style={styles.errorText}>{errors.video}</Text> : null}
                </>
              ) : (
                <>
                  <TouchableOpacity style={[styles.uploadBtn, errors.video ? styles.inputError : null]} onPress={takeTechniqueVideo}>
                    <Text style={styles.uploadBtnIcon}>📹</Text>
                    <Text style={styles.uploadBtnText}>Take video</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.uploadBtn} onPress={pickTechniqueVideoFromGallery}>
                    <Text style={styles.uploadBtnIcon}>🎬</Text>
                    <Text style={styles.uploadBtnText}>Choose from gallery</Text>
                  </TouchableOpacity>
                  {errors.video ? <Text style={styles.errorText}>{errors.video}</Text> : null}
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.intro}>Choose a thumbnail image for your module (optional).</Text>
              <Text style={styles.label}>Thumbnail (optional)</Text>
              {thumbnailUri ? (
                <>
                  <View style={styles.mediaPreviewWrap}>
                    <Image source={{ uri: thumbnailUri }} style={styles.imagePreview} resizeMode="contain" />
                  </View>
                  <Text style={styles.previewHint}>Preview your thumbnail above.</Text>
                  <TouchableOpacity onPress={() => setThumbnailUri(null)} style={styles.removeFile}>
                    <Text style={styles.removeFileText}>Remove image</Text>
                  </TouchableOpacity>
                  {errors.thumbnail ? <Text style={styles.errorText}>{errors.thumbnail}</Text> : null}
                </>
              ) : (
                <>
                  <TouchableOpacity style={[styles.uploadBtn, errors.thumbnail ? styles.inputError : null]} onPress={takeThumbnailPhoto}>
                    <Text style={styles.uploadBtnIcon}>📷</Text>
                    <Text style={styles.uploadBtnText}>Take a picture</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.uploadBtn, errors.thumbnail ? styles.inputError : null]} onPress={pickThumbnailFromGallery}>
                    <Text style={styles.uploadBtnIcon}>🖼</Text>
                    <Text style={styles.uploadBtnText}>Pick from gallery</Text>
                  </TouchableOpacity>
                  {errors.thumbnail ? <Text style={styles.errorText}>{errors.thumbnail}</Text> : null}
                </>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <Text style={styles.intro}>Set intensity, rep range, and confirm.</Text>
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

              <Text style={styles.label}>Warmup * (pick 3)</Text>
              <TouchableOpacity
                style={[styles.selectBtn, errors.warmupExercises ? styles.inputError : null]}
                onPress={() => setShowWarmupDropdown(!showWarmupDropdown)}
              >
                <Text style={styles.selectText}>
                  {warmupExercises.length ? `${warmupExercises.length} selected` : 'Select warmup exercises'}
                </Text>
                <Text style={styles.chevron}>{showWarmupDropdown ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {errors.warmupExercises ? <Text style={styles.errorText}>{errors.warmupExercises}</Text> : null}
              {showWarmupDropdown && (
                <View style={styles.pickerList}>
                  {warmupOptions.map((w) => (
                    <TouchableOpacity
                      key={w}
                      style={styles.pickerItemCheck}
                      onPress={() => toggleWarmup(w)}
                    >
                      <View style={[styles.checkbox, warmupExercises.includes(w) && styles.checkboxChecked]}>
                        {warmupExercises.includes(w) ? <Text style={styles.check}>✓</Text> : null}
                      </View>
                      <Text style={styles.pickerItemText}>{w}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Cooldown * (pick 3)</Text>
              <TouchableOpacity
                style={[styles.selectBtn, errors.cooldownExercises ? styles.inputError : null]}
                onPress={() => setShowCooldownDropdown(!showCooldownDropdown)}
              >
                <Text style={styles.selectText}>
                  {cooldownExercises.length ? `${cooldownExercises.length} selected` : 'Select cooldown stretches'}
                </Text>
                <Text style={styles.chevron}>{showCooldownDropdown ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {errors.cooldownExercises ? <Text style={styles.errorText}>{errors.cooldownExercises}</Text> : null}
              {showCooldownDropdown && (
                <View style={styles.pickerList}>
                  {cooldownOptions.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={styles.pickerItemCheck}
                      onPress={() => toggleCooldown(c)}
                    >
                      <View style={[styles.checkbox, cooldownExercises.includes(c) && styles.checkboxChecked]}>
                        {cooldownExercises.includes(c) ? <Text style={styles.check}>✓</Text> : null}
                      </View>
                      <Text style={styles.pickerItemText}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

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

              <Text style={styles.label}>Difficulty (optional)</Text>
              <TouchableOpacity style={styles.selectBtn} onPress={() => setShowDifficultyPicker(!showDifficultyPicker)}>
                <Text style={difficultyLevel ? styles.selectText : styles.placeholderText}>
                  {difficultyLevel ? difficultyOptions.find((o) => o.value === difficultyLevel)?.label ?? difficultyLevel : 'Basic / Intermediate / Advanced'}
                </Text>
                <Text style={styles.chevron}>▼</Text>
              </TouchableOpacity>
              {showDifficultyPicker && (
                <View style={styles.pickerList}>
                  {difficultyOptions.map((o) => (
                    <TouchableOpacity
                      key={o.value}
                      style={styles.pickerItem}
                      onPress={() => { setDifficultyLevel(o.value); setShowDifficultyPicker(false); }}
                    >
                      <Text style={styles.pickerItemText}>{o.label}</Text>
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
            </>
          )}

          </ScrollView>
          </Animated.View>
        </View>

        {step > 1 && (
          <View style={styles.footer}>
            <TouchableOpacity style={styles.backFooterBtnBalanced} onPress={() => goToStep(step - 1, 'back')}>
              <Text style={styles.backFooterBtnText}>Back</Text>
            </TouchableOpacity>
            {step < 4 ? (
              <TouchableOpacity
                style={styles.nextBtnBalanced}
                onPress={() => {
                if (step === 2) {
                  if (!techniqueVideoFile) {
                    setErrors((e) => ({ ...e, video: 'Take or choose a video' }));
                    showToast('Take a video or choose from gallery');
                    return;
                  }
                  setErrors((e) => ({ ...e, video: '' }));
                }
                  goToStep(step + 1, 'forward');
                }}
              >
                <Text style={styles.nextBtnText}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.submitBtn, styles.submitBtnFooter, loading && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? <ActivityIndicator size="small" color="#041527" /> : <Text style={styles.submitBtnText}>Submit for review</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
    </SafeAreaView>
  );
}

// --- Styles ---
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
  stepContentClip: { flex: 1, overflow: 'hidden' },
  stepContentWrap: { flex: 1, width: SCREEN_WIDTH },
  stepHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#062731' },
  stepTitle: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  stepCounter: { fontSize: 12, color: '#8fa3b0', marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#062731',
    backgroundColor: '#041527',
    gap: 12,
  },
  backFooterBtnBalanced: { flex: 1, paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent', borderWidth: 2, borderColor: '#07bbc0' },
  nextBtnBalanced: { flex: 1, backgroundColor: '#07bbc0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  backFooterBtnText: { color: '#07bbc0', fontSize: 16, fontWeight: '600' },
  nextBtnText: { color: '#041527', fontSize: 16, fontWeight: '700' },
  step1NextWrap: { alignItems: 'center', marginTop: 20, marginBottom: 16 },
  nextBtnCentered: { backgroundColor: '#07bbc0', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
  pickerItemCheck: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#0a3645' },
  pickerItemText: { color: '#FFF', fontSize: 15, flex: 1 },
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
  mediaPreviewWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#011f36', borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  videoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  videoPlaceholderIcon: { fontSize: 48, marginBottom: 8 },
  videoPlaceholderText: { fontSize: 16, color: '#FFF', fontWeight: '600', marginBottom: 4 },
  imagePreview: { width: '100%', height: '100%' },
  videoPreview: { width: '100%', height: '100%' },
  previewHint: { fontSize: 12, color: '#8fa3b0', marginBottom: 8 },
  rulesBox: {
    backgroundColor: 'rgba(7, 187, 192, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.35)',
    padding: 14,
    marginBottom: 20,
  },
  rulesTitle: { fontSize: 13, fontWeight: '700', color: '#07bbc0', marginBottom: 8 },
  rulesText: { fontSize: 13, color: '#b0c4d0', lineHeight: 20, marginBottom: 4 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 2, borderColor: '#07bbc0', backgroundColor: '#011f36', marginBottom: 8 },
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
  submitBtnFooter: { flex: 1 },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#041527', fontSize: 16, fontWeight: '700' },
  submittingLabel: { color: '#FFF', fontSize: 18, fontWeight: '600', marginTop: 16 },
  submittingHint: { color: '#8fa3b0', fontSize: 14, marginTop: 8 },
});

/**
 * ProfileScreen
 * User profile: name, photo, stats, password change. Trainer profile section if approved.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AuthController } from '../lib/controllers/AuthController';
import { getPurchasedModulesMeta } from '../lib/controllers/modulePurchases';
import { MARTIAL_ARTS, BELT_BASED_MARTIAL_ARTS, BELT_SYSTEMS } from '../lib/constants/martialArts';

const FACEBOOK_LOGO = require('../assets/images/facebooklogo.png');
const INSTAGRAM_LOGO = require('../assets/images/instagramlogo.png');

type ProfileScreenProps = {
  onOpenTrainerInsights?: () => void;
};

// --- Component ---
export default function ProfileScreen({ onOpenTrainerInsights }: ProfileScreenProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [editFirstError, setEditFirstError] = useState('');
  const [editLastError, setEditLastError] = useState('');
  const [currentPwError, setCurrentPwError] = useState('');
  const [newPwError, setNewPwError] = useState('');
  const [confirmPwError, setConfirmPwError] = useState('');
  const [imagePickerFor, setImagePickerFor] = useState<'profile' | 'cover' | null>(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [isApprovedTrainer, setIsApprovedTrainer] = useState(false);
  const [trainerProfileModalVisible, setTrainerProfileModalVisible] = useState(false);
  const [selectedDefenseStyles, setSelectedDefenseStyles] = useState<string[]>([]);
  const [trainerCurrentRank, setTrainerCurrentRank] = useState('');
  const [trainerAboutMe, setTrainerAboutMe] = useState('');
  const [trainerAboutMeImageUrl, setTrainerAboutMeImageUrl] = useState<string | null>(null);
  const [trainerAboutMeImageName, setTrainerAboutMeImageName] = useState<string | null>(null);
  const [trainerFacebookLink, setTrainerFacebookLink] = useState('');
  const [trainerInstagramLink, setTrainerInstagramLink] = useState('');
  const [trainerOtherLink, setTrainerOtherLink] = useState('');
  const [uploadingAboutMeAttachment, setUploadingAboutMeAttachment] = useState(false);
  const [showDefenseStylesPicker, setShowDefenseStylesPicker] = useState(false);
  const [showBeltPicker, setShowBeltPicker] = useState(false);
  const [savingTrainerProfile, setSavingTrainerProfile] = useState(false);
  const [trainerProfileError, setTrainerProfileError] = useState('');
  const [loadingPurchasedModules, setLoadingPurchasedModules] = useState(true);
  const [purchasedModules, setPurchasedModules] = useState<Array<{ moduleId: string; moduleTitle: string; category: string; referenceNo?: string }>>([]);
  const [selectedPurchasedCategory, setSelectedPurchasedCategory] = useState('Punching');
  const [loadingPublishedModules, setLoadingPublishedModules] = useState(false);
  const [publishedModules, setPublishedModules] = useState<Array<{ moduleId: string; moduleTitle: string; category: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [user, purchasedMeta] = await Promise.all([
        AuthController.getCurrentUser(),
        getPurchasedModulesMeta(),
      ]);
      if (cancelled) return;
      if (user) {
        setFirstName(user.firstName || '');
        setLastName(user.lastName || '');
        setProfilePicture(user.profilePicture || null);
        setCoverPhoto(user.coverPhoto ?? null);
        const isTrainer = user.role === 'trainer' && user.trainerApproved === true;
        setIsApprovedTrainer(isTrainer);
        if (isTrainer) {
          setLoadingPublishedModules(true);
          try {
            const approvedModules = await AuthController.getApprovedModules();
            if (cancelled) return;
            const trainerName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim().toLowerCase();
            const mine = approvedModules.filter((module) => {
              const moduleRecord = module as unknown as Record<string, unknown>;
              const moduleTrainerId = String(moduleRecord.trainerId ?? '').trim();
              const moduleTrainerName = String(moduleRecord.trainerName ?? '').trim().toLowerCase();
              return (moduleTrainerId && moduleTrainerId === user.uid) || (trainerName && moduleTrainerName === trainerName);
            });
            setPublishedModules(
              mine.map((module) => ({
                moduleId: module.moduleId,
                moduleTitle: module.moduleTitle || module.moduleId,
                category: module.category || 'Other',
              }))
            );
          } catch (e) {
            console.error('loadPublishedModules:', e);
            setPublishedModules([]);
          } finally {
            if (!cancelled) setLoadingPublishedModules(false);
          }
        } else {
          setPublishedModules([]);
        }
      }
      if (purchasedMeta.length > 0) {
        const purchasedIds = purchasedMeta.map((m) => m.moduleId);
        const purchasedList = await AuthController.getModulesByIds(purchasedIds);
        if (cancelled) return;
        const byId = new Map(purchasedMeta.map((m) => [m.moduleId, m]));
        setPurchasedModules(
          purchasedList.map((m) => ({
            moduleId: m.moduleId,
            moduleTitle: m.moduleTitle || m.moduleId,
            category: m.category || 'Other',
            referenceNo: byId.get(m.moduleId)?.referenceNo,
          }))
        );
      } else {
        setPurchasedModules([]);
      }
      setLoadingPurchasedModules(false);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'User';
  const hasEditProfileChanges =
    editFirstName !== firstName ||
    editLastName !== lastName ||
    currentPassword.length > 0 ||
    newPassword.length > 0 ||
    confirmPassword.length > 0;

  const openEditModal = () => {
    setEditFirstName(firstName);
    setEditLastName(lastName);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setProfileError('');
    setEditFirstError('');
    setEditLastError('');
    setCurrentPwError('');
    setNewPwError('');
    setConfirmPwError('');
    setEditModalVisible(true);
  };

  const openTrainerProfileModal = async () => {
    setTrainerProfileError('');
    try {
      const user = await AuthController.getCurrentUser();
      if (!user) return;
      const app = await AuthController.getUserTrainerApplication(user.uid);
      if (app) {
        setSelectedDefenseStyles(Array.isArray(app.defenseStyles) ? app.defenseStyles : []);
        setTrainerCurrentRank(app.currentRank || '');
        setTrainerAboutMe(app.aboutMe || '');
        setTrainerAboutMeImageUrl(app.aboutMeImageUrl || null);
        setTrainerAboutMeImageName(app.aboutMeImageUrl ? 'Attached' : null);
        setTrainerFacebookLink(app.facebookLink || '');
        setTrainerInstagramLink(app.instagramLink || '');
        setTrainerOtherLink(app.otherLink || '');
      } else {
        setSelectedDefenseStyles([]);
        setTrainerCurrentRank('');
        setTrainerAboutMe('');
        setTrainerAboutMeImageUrl(null);
        setTrainerAboutMeImageName(null);
        setTrainerFacebookLink('');
        setTrainerInstagramLink('');
        setTrainerOtherLink('');
      }
      setTrainerProfileModalVisible(true);
    } catch (e) {
      console.error('openTrainerProfileModal:', e);
      setTrainerProfileError('Could not load trainer profile.');
    }
  };

  const hasBeltSystem = selectedDefenseStyles.some((a) => BELT_BASED_MARTIAL_ARTS.includes(a));
  const availableBelts = ((): string[] => {
    const set = new Set<string>();
    selectedDefenseStyles.forEach((a) => BELT_SYSTEMS[a]?.forEach((b) => set.add(b)));
    return Array.from(set).sort();
  })();

  const canOpenTrainerInsights = typeof onOpenTrainerInsights === 'function';

  const toggleDefenseStyle = (art: string) => {
    setSelectedDefenseStyles((prev) =>
      prev.includes(art) ? prev.filter((a) => a !== art) : [...prev, art]
    );
  };

  const handleAddAboutMeAttachment = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to add a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    setUploadingAboutMeAttachment(true);
    setTrainerProfileError('');
    try {
      const url = await AuthController.uploadFileToCloudinary(
        asset.uri,
        'image',
        asset.fileName || `about_${Date.now()}.jpg`
      );
      setTrainerAboutMeImageUrl(url);
      setTrainerAboutMeImageName(asset.fileName || 'Image');
    } catch (e) {
      console.error('upload about-me image:', e);
      setTrainerProfileError('Failed to upload image. Try again.');
    } finally {
      setUploadingAboutMeAttachment(false);
    }
  };

  const handleSaveTrainerProfile = async () => {
    setTrainerProfileError('');
    const user = await AuthController.getCurrentUser();
    if (!user) return;
    setSavingTrainerProfile(true);
    try {
      await AuthController.updateTrainerProfile(user.uid, {
        defenseStyles: selectedDefenseStyles,
        currentRank: trainerCurrentRank.trim() || undefined,
        aboutMe: trainerAboutMe.trim() || undefined,
        aboutMeImageUrl: trainerAboutMeImageUrl || undefined,
        facebookLink: trainerFacebookLink.trim(),
        instagramLink: trainerInstagramLink.trim(),
        otherLink: trainerOtherLink.trim(),
      });
      setTrainerProfileModalVisible(false);
    } catch (e) {
      console.error('handleSaveTrainerProfile:', e);
      setTrainerProfileError((e as Error)?.message || 'Could not save. Please try again.');
    } finally {
      setSavingTrainerProfile(false);
    }
  };

  const handleSaveProfile = async () => {
    setProfileError('');
    setEditFirstError('');
    setEditLastError('');
    setCurrentPwError('');
    setNewPwError('');
    setConfirmPwError('');

    const newFirst = editFirstName.trim();
    const newLast = editLastName.trim();
    const hasPasswordChange = currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;
    let hasErrors = false;

    if (!newFirst) {
      setEditFirstError('First name is required.');
      hasErrors = true;
    }
    if (!newLast) {
      setEditLastError('Last name is required.');
      hasErrors = true;
    }
    if (hasPasswordChange) {
      if (!currentPassword.trim()) {
        setCurrentPwError('Enter your current password to change password.');
        hasErrors = true;
      }
      if (newPassword.length < 6) {
        setNewPwError('New password must be at least 6 characters.');
        hasErrors = true;
      }
      if (newPassword !== confirmPassword) {
        setConfirmPwError('Passwords do not match.');
        hasErrors = true;
      }
    }
    if (hasErrors) return;

    setSavingProfile(true);
    try {
      await AuthController.updateUserProfile({
        firstName: newFirst,
        lastName: newLast,
      });
      setFirstName(newFirst);
      setLastName(newLast);
      if (hasPasswordChange) {
        await AuthController.changePassword(currentPassword, newPassword);
      }
      setEditModalVisible(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save. Please try again.';
      setProfileError(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleImagePickerPress = () => {
    setImagePickerFor('profile');
  };

  const handleCoverImagePickerPress = () => {
    setImagePickerFor('cover');
  };

  const handleTakePhoto = async () => {
    const target = imagePickerFor;
    setImagePickerFor(null);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to take a photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: target === 'cover' ? [16, 9] : [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = result.assets[0].uri;
      if (target === 'cover') {
        setUploadingCover(true);
        const url = await AuthController.updateCoverPhoto(uri);
        setCoverPhoto(url);
      } else {
        setUploadingPicture(true);
        const url = await AuthController.updateProfilePicture(uri);
        setProfilePicture(url);
      }
    } catch (e) {
      console.error('camera pick:', e);
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save photo.');
    } finally {
      setUploadingPicture(false);
      setUploadingCover(false);
    }
  };

  const handlePickFromGallery = async () => {
    const target = imagePickerFor;
    setImagePickerFor(null);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Gallery permission is required to choose a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: target === 'cover' ? [16, 9] : [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = result.assets[0].uri;
      if (target === 'cover') {
        setUploadingCover(true);
        const url = await AuthController.updateCoverPhoto(uri);
        setCoverPhoto(url);
      } else {
        setUploadingPicture(true);
        const url = await AuthController.updateProfilePicture(uri);
        setProfilePicture(url);
      }
    } catch (e) {
      console.error('gallery pick:', e);
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save photo.');
    } finally {
      setUploadingPicture(false);
      setUploadingCover(false);
    }
  };

  const purchasedCategoryTabs = ['Punching', 'Kicking', 'Elbow Strikes', 'Knee Strikes', 'Defensive Moves'];
  const getCategoryCount = (category: string): number =>
    purchasedModules.filter((m) => (m.category || '').trim().toLowerCase() === category.trim().toLowerCase()).length;
  const purchasedInSelectedCategory = purchasedModules.filter(
    (m) => (m.category || '').trim().toLowerCase() === selectedPurchasedCategory.trim().toLowerCase()
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#07bbc0" />
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.coverHero}>
          {coverPhoto ? (
            <Image source={{ uri: coverPhoto }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="image-outline" size={40} color="#45616c" />
            </View>
          )}
          {uploadingCover ? (
            <View style={styles.coverUploadOverlay}>
              <ActivityIndicator size="large" color="#FFF" />
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.coverChangeButton}
            onPress={handleCoverImagePickerPress}
            disabled={uploadingCover || uploadingPicture}
            activeOpacity={0.85}
          >
            <Ionicons name="camera-outline" size={18} color="#041527" />
            <Text style={styles.coverChangeButtonText}>Cover photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.profileBody}>
          <View style={styles.avatarWrap}>
            <TouchableOpacity
              style={styles.avatarTouchable}
              onPress={handleImagePickerPress}
              disabled={uploadingPicture || uploadingCover}
              activeOpacity={0.8}
            >
              {profilePicture ? (
                <Image source={{ uri: profilePicture }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarLetter}>{fullName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              {uploadingPicture && (
                <View style={styles.avatarUploadOverlay}>
                  <ActivityIndicator size="large" color="#FFF" />
                </View>
              )}
              <View style={styles.avatarAddIconWrap}>
                <Text style={styles.avatarAddIconText}>+</Text>
              </View>
            </TouchableOpacity>
          </View>
          <Text style={styles.displayName}>{fullName}</Text>

          <View style={styles.editButtonRow}>
            <TouchableOpacity
              style={[styles.editButtonHalf, styles.editButtonFull]}
              onPress={openEditModal}
            >
              <Text style={styles.editButtonText}>Edit profile</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.editHint}>
            Change your name and password
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Purchased Modules</Text>
            <Text style={styles.sectionHint}>Modules you unlocked with credits ({purchasedModules.length}).</Text>
            {loadingPurchasedModules ? (
              <View style={styles.purchasedLoadingWrap}>
                <ActivityIndicator size="small" color="#07bbc0" />
              </View>
            ) : purchasedModules.length === 0 ? (
              <Text style={styles.purchasedEmpty}>No purchased modules yet.</Text>
            ) : (
              <>
                <View style={styles.categoryTabsWrap}>
                  {purchasedCategoryTabs.map((cat) => {
                    const isActive = selectedPurchasedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.categoryTabBtn, isActive && styles.categoryTabBtnActive]}
                        onPress={() => setSelectedPurchasedCategory(cat)}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.categoryTabBtnText, isActive && styles.categoryTabBtnTextActive]}>
                          {cat} ({getCategoryCount(cat)})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <ScrollView
                  style={styles.purchasedModalScroll}
                  contentContainerStyle={styles.purchasedModalScrollContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {purchasedInSelectedCategory.length === 0 ? (
                    <View style={styles.purchasedEmptyCenterWrap}>
                      <Text style={styles.purchasedEmptyCenterText}>No modules purchased</Text>
                    </View>
                  ) : (
                    purchasedInSelectedCategory.map((item) => (
                      <View key={item.moduleId} style={styles.purchasedItem}>
                        <View style={styles.purchasedTextWrap}>
                          <Text style={styles.purchasedTitle} numberOfLines={1}>{item.moduleTitle}</Text>
                          {item.referenceNo ? <Text style={styles.purchasedRef} numberOfLines={1}>Ref: {item.referenceNo}</Text> : null}
                        </View>
                        <View style={styles.purchasedBadge}>
                          <Text style={styles.purchasedBadgeText}>Owned</Text>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
                {isApprovedTrainer ? (
                  <TouchableOpacity
                    style={styles.viewPublishedBtn}
                    onPress={() => onOpenTrainerInsights?.()}
                    activeOpacity={0.9}
                    disabled={loadingPublishedModules || !canOpenTrainerInsights}
                  >
                    <Text style={styles.viewPublishedBtnText}>
                      {loadingPublishedModules
                        ? 'Loading published modules...'
                        : `Trainer Insights (${publishedModules.length} modules)`}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <View style={styles.modalFieldWrap}>
              <TextInput
                style={[styles.input, styles.modalInput]}
                value={editFirstName}
                onChangeText={(t) => { setEditFirstName(t); setEditFirstError(''); }}
                placeholder="First name"
                placeholderTextColor="#6b8693"
              />
              {editFirstError ? <Text style={styles.fieldErrorText}>{editFirstError}</Text> : null}
            </View>
            <View style={styles.modalFieldWrap}>
              <TextInput
                style={[styles.input, styles.modalInput]}
                value={editLastName}
                onChangeText={(t) => { setEditLastName(t); setEditLastError(''); }}
                placeholder="Last name"
                placeholderTextColor="#6b8693"
              />
              {editLastError ? <Text style={styles.fieldErrorText}>{editLastError}</Text> : null}
            </View>
            <Text style={styles.passwordSectionLabel}>Change password (optional)</Text>
            <View style={styles.modalFieldWrap}>
              <TextInput
                style={[styles.input, styles.modalInput]}
                value={currentPassword}
                onChangeText={(t) => { setCurrentPassword(t); setCurrentPwError(''); }}
                placeholder="Current password"
                placeholderTextColor="#6b8693"
                secureTextEntry
              />
              {currentPwError ? <Text style={styles.fieldErrorText}>{currentPwError}</Text> : null}
            </View>
            <View style={styles.modalFieldWrap}>
              <TextInput
                style={[styles.input, styles.modalInput]}
                value={newPassword}
                onChangeText={(t) => { setNewPassword(t); setNewPwError(''); setConfirmPwError(''); }}
                placeholder="New password"
                placeholderTextColor="#6b8693"
                secureTextEntry
              />
              {newPwError ? <Text style={styles.fieldErrorText}>{newPwError}</Text> : null}
            </View>
            <View style={styles.modalFieldWrap}>
              <TextInput
                style={[styles.input, styles.modalInput]}
                value={confirmPassword}
                onChangeText={(t) => { setConfirmPassword(t); setConfirmPwError(''); }}
                placeholder="Confirm new password"
                placeholderTextColor="#6b8693"
                secureTextEntry
              />
              {confirmPwError ? <Text style={styles.fieldErrorText}>{confirmPwError}</Text> : null}
            </View>
            {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, (savingProfile || !hasEditProfileChanges) && styles.buttonDisabled]}
                onPress={handleSaveProfile}
                disabled={savingProfile || !hasEditProfileChanges}
              >
                <Text style={styles.modalSaveText}>{savingProfile ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={trainerProfileModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit trainer profile</Text>
            <Text style={styles.editHint}>This is what learners see on the Trainer page.</Text>
            <View style={styles.modalFieldWrap}>
              <Text style={styles.label}>Defense styles</Text>
              <TouchableOpacity
                style={styles.defenseStylesSelect}
                onPress={() => setShowDefenseStylesPicker(!showDefenseStylesPicker)}
              >
                <Text style={selectedDefenseStyles.length ? styles.selectText : styles.placeholderText} numberOfLines={2}>
                  {selectedDefenseStyles.length ? selectedDefenseStyles.join(', ') : 'Tap to choose martial arts'}
                </Text>
                <Text style={styles.chevron}>▼</Text>
              </TouchableOpacity>
              {showDefenseStylesPicker && (
                <View style={styles.pickerList}>
                  <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                    {MARTIAL_ARTS.map((art) => (
                      <TouchableOpacity
                        key={art}
                        style={styles.pickerItem}
                        onPress={() => toggleDefenseStyle(art)}
                      >
                        <Text style={styles.pickerItemText}>{art}</Text>
                        {selectedDefenseStyles.includes(art) ? <Text style={styles.check}>✓</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
            {hasBeltSystem && (
              <View style={styles.modalFieldWrap}>
                <Text style={styles.label}>Belt / rank</Text>
                <TouchableOpacity
                  style={styles.defenseStylesSelect}
                  onPress={() => setShowBeltPicker(!showBeltPicker)}
                >
                  <Text style={trainerCurrentRank ? styles.selectText : styles.placeholderText}>
                    {trainerCurrentRank || 'Select belt...'}
                  </Text>
                  <Text style={styles.chevron}>▼</Text>
                </TouchableOpacity>
                {showBeltPicker && (
                  <View style={styles.pickerList}>
                    <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                      {availableBelts.map((b) => (
                        <TouchableOpacity
                          key={b}
                          style={styles.pickerItem}
                          onPress={() => {
                            setTrainerCurrentRank(b);
                            setShowBeltPicker(false);
                          }}
                        >
                          <Text style={styles.pickerItemText}>{b}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
            <View style={styles.modalFieldWrap}>
              <Text style={styles.labelSecondary}>Social links (shown on Trainers with icons)</Text>
              <View style={styles.trainerSocialRow}>
                <View style={styles.trainerSocialCol}>
                  <View style={styles.trainerSocialLabelRow}>
                    <Image source={FACEBOOK_LOGO} style={styles.trainerSocialLabelIcon} resizeMode="contain" />
                    <Text style={styles.label}>Facebook</Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.modalInput, styles.trainerSocialColInput]}
                    value={trainerFacebookLink}
                    onChangeText={setTrainerFacebookLink}
                    placeholder="URL"
                    placeholderTextColor="#6b8693"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
                <View style={[styles.trainerSocialCol, styles.trainerSocialColSecond]}>
                  <View style={styles.trainerSocialLabelRow}>
                    <Image source={INSTAGRAM_LOGO} style={styles.trainerSocialLabelIcon} resizeMode="contain" />
                    <Text style={styles.label}>Instagram</Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.modalInput, styles.trainerSocialColInput]}
                    value={trainerInstagramLink}
                    onChangeText={setTrainerInstagramLink}
                    placeholder="URL"
                    placeholderTextColor="#6b8693"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
              </View>
              <Text style={[styles.label, styles.trainerSocialFieldSpacer]}>Other link</Text>
              <TextInput
                style={[styles.input, styles.modalInput]}
                value={trainerOtherLink}
                onChangeText={setTrainerOtherLink}
                placeholder="Website or other URL (optional)"
                placeholderTextColor="#6b8693"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            <View style={styles.modalFieldWrap}>
              <Text style={styles.label}>About you</Text>
              <TextInput
                style={[styles.input, styles.modalInput, styles.modalInputMultiline]}
                value={trainerAboutMe}
                onChangeText={setTrainerAboutMe}
                placeholder="Short bio for the Trainer page"
                placeholderTextColor="#6b8693"
                multiline
                numberOfLines={4}
              />
              <Text style={styles.labelSecondary}>Picture or attachment (optional)</Text>
              {trainerAboutMeImageUrl ? (
                <View style={styles.attachmentRow}>
                  <Image source={{ uri: trainerAboutMeImageUrl }} style={styles.aboutMeThumb} />
                  <Text style={styles.attachmentName} numberOfLines={1}>{trainerAboutMeImageName || 'Attached'}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setTrainerAboutMeImageUrl(null);
                      setTrainerAboutMeImageName(null);
                    }}
                    style={styles.removeAttachmentBtn}
                  >
                    <Text style={styles.removeAttachmentText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.addAttachmentBtn}
                  onPress={handleAddAboutMeAttachment}
                  disabled={uploadingAboutMeAttachment}
                >
                  <Ionicons name="image-outline" size={20} color="#07bbc0" />
                  <Text style={styles.addAttachmentText}>
                    {uploadingAboutMeAttachment ? 'Uploading…' : 'Add picture or image'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {trainerProfileError ? <Text style={styles.errorText}>{trainerProfileError}</Text> : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setTrainerProfileModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, savingTrainerProfile && styles.buttonDisabled]}
                onPress={handleSaveTrainerProfile}
                disabled={savingTrainerProfile}
              >
                <Text style={styles.modalSaveText}>{savingTrainerProfile ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={imagePickerFor != null} transparent animationType="slide">
        <TouchableOpacity
          style={styles.imagePickerOverlay}
          activeOpacity={1}
          onPress={() => setImagePickerFor(null)}
        >
          <View style={styles.imagePickerModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.imagePickerTitle}>
              {imagePickerFor === 'cover' ? 'Cover photo' : 'Profile picture'}
            </Text>
            <TouchableOpacity style={styles.imagePickerOption} onPress={handleTakePhoto}>
              <Ionicons name="camera" size={24} color="#07bbc0" />
              <Text style={styles.imagePickerOptionText}>Open camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imagePickerOption} onPress={handlePickFromGallery}>
              <Ionicons name="images" size={24} color="#07bbc0" />
              <Text style={styles.imagePickerOptionText}>Choose from gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.imagePickerOption, styles.imagePickerCancel]}
              onPress={() => setImagePickerFor(null)}
            >
              <Text style={styles.imagePickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#041527' },
  scroll: { flex: 1 },
  scrollContent: { alignItems: 'stretch', paddingBottom: 48 },
  coverHero: {
    width: '100%',
    height: 152,
    backgroundColor: '#062731',
    position: 'relative',
  },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a3645',
  },
  coverUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverChangeButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#07bbc0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  coverChangeButtonText: { color: '#041527', fontSize: 13, fontWeight: '700' },
  profileBody: { paddingHorizontal: 24, alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
  avatarWrap: { marginTop: -52, marginBottom: 16, position: 'relative', alignSelf: 'center', zIndex: 2 },
  avatarTouchable: { position: 'relative' },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#062731',
    borderWidth: 3,
    borderColor: '#041527',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#07bbc0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#041527',
  },
  avatarLetter: { color: '#041527', fontSize: 40, fontWeight: '700' },
  avatarUploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarAddIconWrap: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#07bbc0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#041527',
    zIndex: 10,
    elevation: 10,
  },
  avatarAddIconText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
    marginTop: -2,
  },
  imagePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  imagePickerModal: {
    backgroundColor: '#011f36',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 20,
  },
  imagePickerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  imagePickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#024446',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  imagePickerOptionText: { color: '#FFF', fontSize: 16, fontWeight: '500', marginLeft: 12 },
  imagePickerCancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#6b8693', marginTop: 8 },
  imagePickerCancelText: { color: '#FFF', fontSize: 16, textAlign: 'center', width: '100%' },
  displayName: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  section: { width: '100%', marginBottom: 24, backgroundColor: '#011f36', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#062731' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  sectionHint: { fontSize: 12, color: '#6b8693', marginBottom: 12 },
  row: { marginBottom: 12 },
  label: { fontSize: 14, color: '#6b8693', marginBottom: 4 },
  input: { backgroundColor: '#062731', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#FFF', borderWidth: 1, borderColor: '#0a3645' },
  buttonDisabled: { opacity: 0.6 },
  editButtonRow: { flexDirection: 'row', gap: 10, marginBottom: 6, flexWrap: 'wrap' },
  editButtonHalf: { borderWidth: 1.5, borderColor: '#07bbc0', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, flex: 1, minWidth: 100, alignItems: 'center' },
  editButtonFull: { flex: 1, minWidth: '100%' },
  editButton: { borderWidth: 2, borderColor: '#07bbc0', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginBottom: 6 },
  editButtonText: { color: '#07bbc0', fontSize: 14, fontWeight: '600' },
  editHint: { color: '#6b8693', fontSize: 12, marginBottom: 28 },
  purchasedLoadingWrap: { paddingVertical: 12, alignItems: 'center' },
  purchasedEmpty: { color: '#6b8693', fontSize: 13, marginTop: 4 },
  viewPurchasedBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  viewPurchasedBtnText: { color: '#07bbc0', fontSize: 14, fontWeight: '700' },
  viewPublishedBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(7, 187, 192, 0.08)',
  },
  viewPublishedBtnText: { color: '#07bbc0', fontSize: 14, fontWeight: '700' },
  purchasedList: { marginTop: 6, gap: 8 },
  purchasedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#041527',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  purchasedTextWrap: { flex: 1, paddingRight: 10 },
  purchasedTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  purchasedMeta: { color: '#6b8693', fontSize: 12, marginTop: 2 },
  purchasedRef: { color: '#07bbc0', fontSize: 11, marginTop: 4, fontWeight: '700' },
  purchasedModalContent: { maxHeight: '80%' },
  publishedModalContent: { maxHeight: '80%' },
  categoryTabsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  categoryTabBtn: {
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(7, 187, 192, 0.08)',
  },
  categoryTabBtnActive: {
    backgroundColor: '#07bbc0',
  },
  categoryTabBtnText: { color: '#07bbc0', fontSize: 12, fontWeight: '700' },
  categoryTabBtnTextActive: { color: '#041527' },
  purchasedModalScroll: { width: '100%', marginTop: 8, minHeight: 260, maxHeight: 260 },
  publishedModalScroll: { width: '100%', marginTop: 8, minHeight: 300, maxHeight: 300 },
  purchasedModalScrollContent: { paddingBottom: 8, flexGrow: 1 },
  purchasedCategoryBlock: { marginBottom: 16 },
  purchasedCategoryTitle: { color: '#07bbc0', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  purchasedBackBtn: { marginTop: 16, minHeight: 52, justifyContent: 'center' },
  purchasedEmptyCenterWrap: { flex: 1, minHeight: 244, justifyContent: 'center', alignItems: 'center' },
  purchasedEmptyCenterText: { color: '#6b8693', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  purchasedBadge: {
    backgroundColor: 'rgba(7, 187, 192, 0.18)',
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  purchasedBadgeText: { color: '#07bbc0', fontSize: 11, fontWeight: '700' },
  publishedMeta: { color: '#6b8693', fontSize: 12, marginTop: 4 },
  publishedBadge: {
    backgroundColor: 'rgba(7, 187, 192, 0.18)',
    borderWidth: 1,
    borderColor: '#07bbc0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  publishedBadgeText: { color: '#07bbc0', fontSize: 11, fontWeight: '700' },
  analyticsHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  analyticsHeaderTextWrap: { flex: 1, minWidth: 0 },
  analyticsCloseIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#062731',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0a3645',
  },
  analyticsCloseIcon: { color: '#6b8693', fontSize: 18, fontWeight: '800' },
  analyticsLoadingWrap: { paddingVertical: 26, alignItems: 'center', justifyContent: 'center', gap: 10 },
  analyticsLoadingText: { color: '#6b8693', fontSize: 13, fontWeight: '600' },
  analyticsErrorTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  analyticsErrorSub: { color: '#6b8693', fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 12 },
  analyticsRetryBtn: { backgroundColor: '#07bbc0', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  analyticsRetryBtnText: { color: '#041527', fontSize: 14, fontWeight: '800' },
  analyticsSummaryRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  analyticsTile: {
    flex: 1,
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  analyticsTileLabel: { color: '#6b8693', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  analyticsTileValue: { color: '#07bbc0', fontSize: 18, fontWeight: '900', marginTop: 6 },
  analyticsNoteBox: {
    marginTop: 12,
    backgroundColor: 'rgba(7, 187, 192, 0.08)',
    borderWidth: 1,
    borderColor: '#0a3645',
    borderRadius: 14,
    padding: 12,
  },
  analyticsNoteTitle: { color: '#07bbc0', fontSize: 13, fontWeight: '900' },
  analyticsNoteSub: { color: '#b0c4d0', fontSize: 12, marginTop: 6, lineHeight: 18 },
  analyticsHighlight: {
    marginTop: 12,
    backgroundColor: '#062731',
    borderWidth: 1,
    borderColor: '#0a3645',
    borderRadius: 14,
    padding: 12,
  },
  analyticsHighlightTitle: { color: '#6b8693', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  analyticsHighlightName: { color: '#FFF', fontSize: 15, fontWeight: '900', marginTop: 6 },
  analyticsHighlightMeta: { color: '#b0c4d0', fontSize: 12, marginTop: 6, lineHeight: 18 },
  analyticsModuleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#041527',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  analyticsModuleCardLeft: { width: 56, height: 56 },
  analyticsModuleThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#0a3645' },
  analyticsModuleThumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#0a3645',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsModuleThumbIcon: { fontSize: 22 },
  analyticsModuleCardBody: { flex: 1, minWidth: 0 },
  analyticsModuleTitle: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  analyticsModuleMeta: { color: '#6b8693', fontSize: 12, marginTop: 4 },
  analyticsKpiRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  analyticsKpiChip: {
    flex: 1,
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  analyticsKpiChipLabel: { color: '#6b8693', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  analyticsKpiChipValue: { color: '#07bbc0', fontSize: 13, fontWeight: '900', marginTop: 4 },
  analyticsChevron: { color: '#6b8693', fontSize: 22, fontWeight: '900', marginLeft: 2 },
  analyticsDetailContent: { maxHeight: '85%' },
  analyticsDetailHero: { width: '100%', height: 150, borderRadius: 14, marginTop: 10, marginBottom: 12, backgroundColor: '#0a3645' },
  analyticsDetailHeroPlaceholder: {
    width: '100%',
    height: 150,
    borderRadius: 14,
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: '#0a3645',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsDetailHeroIcon: { fontSize: 48 },
  analyticsDetailCard: {
    marginTop: 12,
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 14,
    padding: 12,
  },
  analyticsDetailCardTitle: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  analyticsDetailCardSub: { color: '#b0c4d0', fontSize: 12, marginTop: 6, lineHeight: 18 },
  analyticsSplitRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  analyticsSplitChip: {
    flex: 1,
    backgroundColor: '#041527',
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  analyticsSplitChipLabel: { color: '#6b8693', fontSize: 11, fontWeight: '800' },
  analyticsSplitChipValue: { color: '#07bbc0', fontSize: 16, fontWeight: '900', marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalScroll: { maxHeight: '85%', width: '100%' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 360, backgroundColor: '#041527', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#062731' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 20 },
  modalFieldWrap: { marginBottom: 20 },
  modalInput: { marginBottom: 0 },
  modalInputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  defenseStylesSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#062731',
    backgroundColor: '#062731',
    minHeight: 48,
  },
  selectText: { color: '#FFF', fontSize: 15, flex: 1 },
  placeholderText: { color: '#6b8693', fontSize: 15, flex: 1 },
  chevron: { color: '#6b8693', fontSize: 12, marginLeft: 8 },
  pickerList: { marginTop: 8, maxHeight: 200, borderRadius: 10, borderWidth: 1, borderColor: '#062731', backgroundColor: '#062731' },
  pickerScroll: { maxHeight: 200 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#041527' },
  pickerItemText: { color: '#FFF', fontSize: 15 },
  check: { color: '#07bbc0', fontSize: 16, fontWeight: '700' },
  labelSecondary: { fontSize: 13, color: '#6b8693', marginTop: 12, marginBottom: 8 },
  trainerSocialRow: { flexDirection: 'row', alignItems: 'flex-start' },
  trainerSocialCol: { flex: 1, minWidth: 0 },
  trainerSocialColSecond: { marginLeft: 12 },
  trainerSocialColInput: { fontSize: 13 },
  trainerSocialLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  trainerSocialFieldSpacer: { marginTop: 12 },
  trainerSocialLabelIcon: { width: 22, height: 22 },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, padding: 12, backgroundColor: '#062731', borderRadius: 10, gap: 10 },
  aboutMeThumb: { width: 40, height: 40, borderRadius: 6 },
  attachmentName: { flex: 1, color: '#FFF', fontSize: 14 },
  removeAttachmentBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  removeAttachmentText: { color: '#e57373', fontSize: 14 },
  addAttachmentBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#062731', borderStyle: 'dashed' },
  addAttachmentText: { color: '#07bbc0', fontSize: 14 },
  fieldErrorText: { color: '#e57373', fontSize: 12, marginTop: 6 },
  passwordSectionLabel: { fontSize: 14, color: '#6b8693', marginTop: 8, marginBottom: 4 },
  errorText: { color: '#e57373', fontSize: 13, marginTop: 8 },
  modalButtons: { flexDirection: 'row', marginTop: 24, gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#6b8693' },
  modalCancelText: { color: '#6b8693', fontSize: 16 },
  modalSaveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: '#07bbc0' },
  modalSaveText: { color: '#041527', fontSize: 16, fontWeight: '600' },
});

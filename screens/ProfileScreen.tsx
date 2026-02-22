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
  Linking,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AuthController } from '../lib/controllers/AuthController';

const PRIVACY_URL = 'https://defendu.com/privacy';
const TERMS_URL = 'https://defendu.com/terms';
const CONTACT_EMAIL = 'support@defendu.com';

export default function ProfileScreen() {
  const [username, setUsername] = useState('@');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [height, setHeight] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [heightInput, setHeightInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [savingStats, setSavingStats] = useState(false);
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
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [user, skillProfile] = await Promise.all([
        AuthController.getCurrentUser(),
        AuthController.getSkillProfile(),
      ]);
      if (cancelled) return;
      if (user) {
        setUsername(user.username?.startsWith('@') ? user.username : `@${user.username || ''}`);
        setFirstName(user.firstName || '');
        setLastName(user.lastName || '');
        setProfilePicture(user.profilePicture || null);
        const h = user.height ?? skillProfile?.height;
        const w = user.weight ?? skillProfile?.weight;
        setHeight(h != null ? String(h) : '');
        setWeight(w != null ? String(w) : '');
        setHeightInput(h != null ? String(h) : '');
        setWeightInput(w != null ? String(w) : '');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'User';
  const hasHeightWeightChanges = heightInput !== height || weightInput !== weight;
  const hasEditProfileChanges =
    editFirstName !== firstName ||
    editLastName !== lastName ||
    currentPassword.length > 0 ||
    newPassword.length > 0 ||
    confirmPassword.length > 0;

  const handleSaveHeightWeight = async () => {
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
    setSavingStats(true);
    try {
      await AuthController.updateUserProfile({
        ...(h !== undefined && { height: h }),
        ...(w !== undefined && { weight: w }),
      });
      if (h !== undefined) setHeight(String(h));
      if (w !== undefined) setWeight(String(w));
    } catch (e) {
      console.error('updateUserProfile:', e);
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSavingStats(false);
    }
  };

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

  const handleResetProgress = () => {
    Alert.alert(
      'Reset all progress',
      'This will clear all completed modules and weekly goal data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await AuthController.resetUserProgress();
              Alert.alert('Done', 'Your progress has been reset.');
            } catch (e) {
              console.error('resetUserProgress:', e);
              Alert.alert('Error', 'Could not reset progress. Please try again.');
            }
          },
        },
      ]
    );
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open link.'));
  };

  const handleImagePickerPress = () => {
    setShowImagePickerModal(true);
  };

  const handleTakePhoto = async () => {
    setShowImagePickerModal(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to take a profile photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = result.assets[0].uri;
      setUploadingPicture(true);
      const url = await AuthController.updateProfilePicture(uri);
      setProfilePicture(url);
    } catch (e) {
      console.error('updateProfilePicture:', e);
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save photo.');
    } finally {
      setUploadingPicture(false);
    }
  };

  const handlePickFromGallery = async () => {
    setShowImagePickerModal(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Gallery permission is required to choose a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = result.assets[0].uri;
      setUploadingPicture(true);
      const url = await AuthController.updateProfilePicture(uri);
      setProfilePicture(url);
    } catch (e) {
      console.error('updateProfilePicture:', e);
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save photo.');
    } finally {
      setUploadingPicture(false);
    }
  };

  const openContact = () => {
    Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => Alert.alert('Error', 'Could not open email.'));
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#07bbc0" />
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.avatarWrap}>
          <TouchableOpacity
            style={styles.avatarTouchable}
            onPress={handleImagePickerPress}
            disabled={uploadingPicture}
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
        <Text style={styles.username}>{username}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Height & Weight</Text>
          <Text style={styles.sectionHint}>From your skill profile; you can update them here.</Text>
          <View style={styles.row}>
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
          <View style={styles.row}>
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
            style={[styles.saveStatsBtn, (savingStats || !hasHeightWeightChanges) && styles.buttonDisabled]}
            onPress={handleSaveHeightWeight}
            disabled={savingStats || !hasHeightWeightChanges}
          >
            <Text style={styles.saveStatsBtnText}>{savingStats ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.editButton} onPress={openEditModal}>
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
        <Text style={styles.editHint}>Change your name and password</Text>

        <View style={styles.linksSection}>
          <TouchableOpacity style={styles.linkRow} onPress={() => openLink(PRIVACY_URL)}>
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => openLink(TERMS_URL)}>
            <Text style={styles.linkText}>Terms of Service</Text>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.linkRow, styles.linkRowLast]} onPress={openContact}>
            <Text style={styles.linkText}>Contact us</Text>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.resetButton} onPress={handleResetProgress}>
          <Text style={styles.resetButtonText}>Reset all progress</Text>
        </TouchableOpacity>
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

      <Modal visible={showImagePickerModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.imagePickerOverlay}
          activeOpacity={1}
          onPress={() => setShowImagePickerModal(false)}
        >
          <View style={styles.imagePickerModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.imagePickerTitle}>Profile picture</Text>
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
              onPress={() => setShowImagePickerModal(false)}
            >
              <Text style={styles.imagePickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#041527' },
  scroll: { flex: 1 },
  content: { padding: 24, alignItems: 'center', paddingTop: 16, paddingBottom: 48 },
  avatarWrap: { marginBottom: 16, position: 'relative', alignSelf: 'center' },
  avatarTouchable: { position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#062731' },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#07bbc0', justifyContent: 'center', alignItems: 'center' },
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
  displayName: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  username: { color: '#6b8693', fontSize: 16, marginBottom: 24 },
  section: { width: '100%', marginBottom: 24, backgroundColor: '#011f36', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#062731' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  sectionHint: { fontSize: 12, color: '#6b8693', marginBottom: 12 },
  row: { marginBottom: 12 },
  label: { fontSize: 14, color: '#6b8693', marginBottom: 4 },
  input: { backgroundColor: '#062731', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#FFF', borderWidth: 1, borderColor: '#0a3645' },
  saveStatsBtn: { backgroundColor: '#07bbc0', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  saveStatsBtnText: { color: '#041527', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
  editButton: { borderWidth: 2, borderColor: '#07bbc0', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginBottom: 6 },
  editButtonText: { color: '#07bbc0', fontSize: 16, fontWeight: '600' },
  editHint: { color: '#6b8693', fontSize: 12, marginBottom: 28 },
  linksSection: { width: '100%', backgroundColor: '#011f36', borderRadius: 16, padding: 4, borderWidth: 1, borderColor: '#062731', marginBottom: 20 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#062731' },
  linkRowLast: { borderBottomWidth: 0 },
  linkText: { color: '#FFF', fontSize: 16 },
  linkChevron: { color: '#6b8693', fontSize: 20 },
  resetButton: { paddingVertical: 14, paddingHorizontal: 20 },
  resetButtonText: { color: '#e57373', fontSize: 15, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 360, backgroundColor: '#041527', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#062731' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 20 },
  modalFieldWrap: { marginBottom: 20 },
  modalInput: { marginBottom: 0 },
  fieldErrorText: { color: '#e57373', fontSize: 12, marginTop: 6 },
  passwordSectionLabel: { fontSize: 14, color: '#6b8693', marginTop: 8, marginBottom: 4 },
  errorText: { color: '#e57373', fontSize: 13, marginTop: 8 },
  modalButtons: { flexDirection: 'row', marginTop: 24, gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#6b8693' },
  modalCancelText: { color: '#6b8693', fontSize: 16 },
  modalSaveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: '#07bbc0' },
  modalSaveText: { color: '#041527', fontSize: 16, fontWeight: '600' },
});

/**
 * TrainerRegistrationScreen
 * Apply to become a trainer: profile, martial arts, credentials, links.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { AuthController } from '../lib/controllers/AuthController';
import type { TrainerApplication } from '../lib/models/TrainerApplication';
import { MARTIAL_ARTS as martialArts, BELT_BASED_MARTIAL_ARTS as beltBasedMartialArts, BELT_SYSTEMS as beltSystems } from '../lib/constants/martialArts';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

// --- Constants ---
const yearsOptions = Array.from({ length: 51 }, (_, i) => i.toString());

// --- Types ---
interface TrainerRegistrationScreenProps {
  onBack: () => void;
  onSuccess: () => void;
}

// --- Component ---
export default function TrainerRegistrationScreen({ onBack, onSuccess }: TrainerRegistrationScreenProps) {
  const { toastVisible, toastMessage, showToast, hideToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [professionalAlias, setProfessionalAlias] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [selectedMartialArts, setSelectedMartialArts] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState('');
  const [yearsTeaching, setYearsTeaching] = useState('');
  const [currentRank, setCurrentRank] = useState('');
  const [facebookLink, setFacebookLink] = useState('');
  const [instagramLink, setInstagramLink] = useState('');
  const [otherLink, setOtherLink] = useState('');
  const [credentialsRevoked, setCredentialsRevoked] = useState<string | null>(null);
  const [credentialsRevokedExplanation, setCredentialsRevokedExplanation] = useState('');
  const [felonyConviction, setFelonyConviction] = useState<string | null>(null);
  const [felonyExplanation, setFelonyExplanation] = useState('');
  const [certifyAccurate, setCertifyAccurate] = useState(false);
  const [agreeConduct, setAgreeConduct] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; uri: string; type: string; size: number }>>([]);
  const [showMartialArtsPicker, setShowMartialArtsPicker] = useState(false);
  const [showYearsExpPicker, setShowYearsExpPicker] = useState(false);
  const [showYearsTeachPicker, setShowYearsTeachPicker] = useState(false);
  const [showRankPicker, setShowRankPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hasBeltSystem = selectedMartialArts.some((a) => beltBasedMartialArts.includes(a));
  const availableBelts = ((): string[] => {
    const set = new Set<string>();
    selectedMartialArts.forEach((a) => beltSystems[a]?.forEach((b) => set.add(b)));
    return Array.from(set).sort();
  })();

  const validateFullName = (name: string) => {
    if (!name.trim()) return 'Full name is required';
    if (name.length < 2) return 'Full name must be at least 2 characters';
    if (/\d/.test(name)) return 'Full name cannot contain numbers';
    return '';
  };
  const validateEmail = (email: string) => {
    if (!email.trim()) return 'Email address is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address';
    return '';
  };
  const validatePhone = (phone: string) => {
    if (!phone.trim()) return 'Phone number is required';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return 'Phone number must contain at least 10 digits';
    return '';
  };
  const validateDateOfBirth = (dob: string) => {
    if (!dob.trim()) return 'Date of birth is required';
    const d = new Date(dob);
    if (isNaN(d.getTime())) return 'Please use YYYY-MM-DD format';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    if (d > today) return 'Date of birth cannot be in the future';
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    if (age < 18) return 'You must be at least 18 years old';
    return '';
  };

  const handleRegister = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    const fullNameError = validateFullName(fullName);
    const dateError = validateDateOfBirth(dateOfBirth);
    const phoneError = validatePhone(phoneNumber);
    const emailError = validateEmail(emailAddress);
    const physicalError = !physicalAddress.trim() ? 'Physical address is required' : '';
    const defenseError = selectedMartialArts.length === 0 ? 'Please select at least one defense style' : '';
    const yearsExpError = !yearsExperience ? 'Years of experience is required' : '';
    const yearsTeachError = !yearsTeaching ? 'Years of teaching experience is required' : '';
    const filesError = uploadedFiles.length === 0 ? 'Please upload at least one certification file' : '';
    const certifyError = !certifyAccurate ? 'You must certify that all information is accurate' : '';
    const conductError = !agreeConduct ? 'You must agree to maintain professional conduct' : '';

    setErrors({
      fullName: fullNameError,
      dateOfBirth: dateError,
      phoneNumber: phoneError,
      emailAddress: emailError,
      physicalAddress: physicalError,
      defenseStyle: defenseError,
      yearsExperience: yearsExpError,
      yearsTeaching: yearsTeachError,
      uploadedFiles: filesError,
      certifyAccurate: certifyError,
      agreeConduct: conductError,
    });

    if (
      fullNameError ||
      dateError ||
      phoneError ||
      emailError ||
      physicalError ||
      defenseError ||
      yearsExpError ||
      yearsTeachError ||
      filesError ||
      certifyError ||
      conductError
    ) {
      showToast('Please fix the errors before submitting');
      setLoading(false);
      return;
    }

    try {
      const user = await AuthController.getCurrentUser();
      if (!user) {
        showToast('Please log in to submit an application');
        setLoading(false);
        return;
      }
      const existing = await AuthController.getUserTrainerApplication(user.uid);
      if (existing && existing.status !== 'rejected') {
        showToast(
          existing.status === 'awaiting review'
            ? 'You already have an application pending. Please wait for review.'
            : 'You cannot submit another application.'
        );
        setLoading(false);
        return;
      }

      const applicationData: TrainerApplication = {
        uid: user.uid,
        fullLegalName: fullName.trim(),
        professionalAlias: professionalAlias.trim() || undefined,
        email: emailAddress.trim(),
        academyName: academyName.trim() || undefined,
        appliedDate: new Date(),
        status: 'awaiting review',
        dateOfBirth: dateOfBirth.trim(),
        phone: phoneNumber.trim(),
        physicalAddress: physicalAddress.trim(),
        defenseStyles: selectedMartialArts,
        yearsOfExperience: yearsExperience,
        yearsOfTeaching: yearsTeaching,
        currentRank: currentRank.trim() || undefined,
        facebookLink: facebookLink.trim() || undefined,
        instagramLink: instagramLink.trim() || undefined,
        otherLink: otherLink.trim() || undefined,
        uploadedFiles,
        credentialsRevoked,
        credentialsRevokedExplanation: credentialsRevoked === 'yes' && credentialsRevokedExplanation.trim() ? credentialsRevokedExplanation : undefined,
        felonyConviction,
        felonyExplanation: felonyConviction === 'yes' && felonyExplanation.trim() ? felonyExplanation : undefined,
        certifyAccurate,
        agreeConduct,
      };

      await AuthController.submitTrainerApplication(applicationData);
      showToast('Application submitted. Wait for admin review.');
      setTimeout(() => onSuccess(), 2000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to submit application. Please try again.';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }, [
    fullName,
    dateOfBirth,
    phoneNumber,
    emailAddress,
    physicalAddress,
    selectedMartialArts,
    yearsExperience,
    yearsTeaching,
    uploadedFiles,
    certifyAccurate,
    agreeConduct,
    professionalAlias,
    academyName,
    currentRank,
    facebookLink,
    instagramLink,
    otherLink,
    credentialsRevoked,
    credentialsRevokedExplanation,
    felonyConviction,
    felonyExplanation,
    showToast,
    onSuccess,
    loading,
  ]);

  const pickFiles = async () => {
    let DocumentPicker: { getDocumentAsync: (opts: { type: string[]; multiple: boolean; copyToCacheDirectory: boolean }) => Promise<{ canceled: boolean; assets?: Array<{ name?: string; uri: string; mimeType?: string; size?: number }> }> } | null = null;
    try {
      DocumentPicker = require('expo-document-picker');
    } catch (_) {
      showToast('File picker not available. Run: npx expo install expo-document-picker');
      return;
    }
    if (!DocumentPicker) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets) {
        const newFiles = result.assets.map((a) => ({
          name: a.name || 'file',
          uri: a.uri,
          type: a.mimeType || 'application/octet-stream',
          size: a.size || 0,
        }));
        setUploadedFiles((prev) => [...prev, ...newFiles]);
        setErrors((e) => ({ ...e, uploadedFiles: '' }));
      }
    } catch (err) {
      console.error(err);
      showToast('Could not pick files. Please try again.');
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleMartialArt = (art: string) => {
    setSelectedMartialArts((prev) =>
      prev.includes(art) ? prev.filter((a) => a !== art) : [...prev, art]
    );
    setErrors((e) => ({ ...e, defenseStyle: '' }));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Image source={require('../assets/images/icon-back.png')} style={styles.backIcon} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trainer Registration</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Apply to become a trainer</Text>
            <Text style={styles.introSub}>Fill each section. Fields with * are required. We'll review and get back to you.</Text>
          </View>

          {/* Step 1: About you */}
          <View style={styles.section}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>1</Text>
            </View>
            <Text style={styles.sectionTitle}>About you</Text>
            <Text style={styles.sectionHint}>Your name, contact details, and where you train.</Text>

            <Text style={styles.label}>Full name *</Text>
            <TextInput
              style={[styles.input, errors.fullName ? styles.inputError : null]}
              placeholder="Your full legal name"
              placeholderTextColor="#6b8693"
              value={fullName}
              onChangeText={(t) => {
                setFullName(t.replace(/\d/g, ''));
                if (errors.fullName) setErrors((e) => ({ ...e, fullName: '' }));
              }}
            />
            {errors.fullName ? <Text style={styles.errorText}>{errors.fullName}</Text> : null}

            <Text style={styles.label}>Professional alias (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Coach Mike"
              placeholderTextColor="#6b8693"
              value={professionalAlias}
              onChangeText={setProfessionalAlias}
            />

            <Text style={styles.label}>Date of birth *</Text>
            <TextInput
              style={[styles.input, errors.dateOfBirth ? styles.inputError : null]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#6b8693"
              value={dateOfBirth}
              onChangeText={(t) => {
                setDateOfBirth(t);
                if (errors.dateOfBirth) setErrors((e) => ({ ...e, dateOfBirth: '' }));
              }}
            />
            {errors.dateOfBirth ? <Text style={styles.errorText}>{errors.dateOfBirth}</Text> : null}

            <Text style={styles.label}>Phone number *</Text>
            <TextInput
              style={[styles.input, errors.phoneNumber ? styles.inputError : null]}
              placeholder="e.g. +1 234 567 8900"
              placeholderTextColor="#6b8693"
              value={phoneNumber}
              onChangeText={(t) => {
                setPhoneNumber(t.replace(/[^\d\s\-+()]/g, ''));
                if (errors.phoneNumber) setErrors((e) => ({ ...e, phoneNumber: '' }));
              }}
              keyboardType="phone-pad"
            />
            {errors.phoneNumber ? <Text style={styles.errorText}>{errors.phoneNumber}</Text> : null}

            <Text style={styles.label}>Email address *</Text>
            <TextInput
              style={[styles.input, errors.emailAddress ? styles.inputError : null]}
              placeholder="your@email.com"
              placeholderTextColor="#6b8693"
              value={emailAddress}
              onChangeText={(t) => {
                setEmailAddress(t);
                if (errors.emailAddress) setErrors((e) => ({ ...e, emailAddress: '' }));
              }}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.emailAddress ? <Text style={styles.errorText}>{errors.emailAddress}</Text> : null}

            <Text style={styles.label}>Academy or gym name (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Where you teach"
              placeholderTextColor="#6b8693"
              value={academyName}
              onChangeText={setAcademyName}
            />

            <Text style={styles.label}>Physical address *</Text>
            <TextInput
              style={[styles.input, errors.physicalAddress ? styles.inputError : null]}
              placeholder="Street, city, state/country"
              placeholderTextColor="#6b8693"
              value={physicalAddress}
              onChangeText={(t) => {
                setPhysicalAddress(t);
                if (errors.physicalAddress) setErrors((e) => ({ ...e, physicalAddress: '' }));
              }}
            />
            {errors.physicalAddress ? <Text style={styles.errorText}>{errors.physicalAddress}</Text> : null}
          </View>

          {/* Step 2: Experience */}
          <View style={styles.section}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>2</Text>
            </View>
            <Text style={styles.sectionTitle}>Your experience</Text>
            <Text style={styles.sectionHint}>Styles you teach, years of experience, and rank.</Text>

            <Text style={styles.label}>Defense style(s) *</Text>
            <TouchableOpacity
              style={[styles.selectBtn, errors.defenseStyle ? styles.inputError : null]}
              onPress={() => setShowMartialArtsPicker(!showMartialArtsPicker)}
            >
              <Text style={selectedMartialArts.length ? styles.selectText : styles.placeholderText} numberOfLines={2}>
                {selectedMartialArts.length ? selectedMartialArts.join(', ') : 'Tap to choose (e.g. Karate, BJJ)'}
              </Text>
              <Text style={styles.chevron}>▼</Text>
            </TouchableOpacity>
            {showMartialArtsPicker && (
              <View style={styles.pickerList}>
                <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                  {martialArts.map((art) => (
                    <TouchableOpacity
                      key={art}
                      style={styles.pickerItem}
                      onPress={() => toggleMartialArt(art)}
                    >
                      <Text style={styles.pickerItemText}>{art}</Text>
                      {selectedMartialArts.includes(art) ? <Text style={styles.check}>✓</Text> : null}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {errors.defenseStyle ? <Text style={styles.errorText}>{errors.defenseStyle}</Text> : null}

            <Text style={styles.label}>Years of experience *</Text>
            <TouchableOpacity
              style={[styles.selectBtn, errors.yearsExperience ? styles.inputError : null]}
              onPress={() => setShowYearsExpPicker(!showYearsExpPicker)}
            >
              <Text style={yearsExperience ? styles.selectText : styles.placeholderText}>
                {yearsExperience ? `${yearsExperience} ${yearsExperience === '1' ? 'year' : 'years'}` : 'Tap to choose'}
              </Text>
              <Text style={styles.chevron}>▼</Text>
            </TouchableOpacity>
            {showYearsExpPicker && (
              <View style={styles.pickerList}>
                <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                  {yearsOptions.map((y) => (
                    <TouchableOpacity
                      key={y}
                      style={styles.pickerItem}
                      onPress={() => {
                        setYearsExperience(y);
                        setShowYearsExpPicker(false);
                        setErrors((e) => ({ ...e, yearsExperience: '' }));
                      }}
                    >
                      <Text style={styles.pickerItemText}>{y} {y === '1' ? 'year' : 'years'}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {errors.yearsExperience ? <Text style={styles.errorText}>{errors.yearsExperience}</Text> : null}

            <Text style={styles.label}>Years of teaching *</Text>
            <TouchableOpacity
              style={[styles.selectBtn, errors.yearsTeaching ? styles.inputError : null]}
              onPress={() => setShowYearsTeachPicker(!showYearsTeachPicker)}
            >
              <Text style={yearsTeaching ? styles.selectText : styles.placeholderText}>
                {yearsTeaching ? `${yearsTeaching} ${yearsTeaching === '1' ? 'year' : 'years'}` : 'Tap to choose'}
              </Text>
              <Text style={styles.chevron}>▼</Text>
            </TouchableOpacity>
            {showYearsTeachPicker && (
              <View style={styles.pickerList}>
                <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                  {yearsOptions.map((y) => (
                    <TouchableOpacity
                      key={y}
                      style={styles.pickerItem}
                      onPress={() => {
                        setYearsTeaching(y);
                        setShowYearsTeachPicker(false);
                        setErrors((e) => ({ ...e, yearsTeaching: '' }));
                      }}
                    >
                      <Text style={styles.pickerItemText}>{y} {y === '1' ? 'year' : 'years'}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {errors.yearsTeaching ? <Text style={styles.errorText}>{errors.yearsTeaching}</Text> : null}

            {hasBeltSystem && (
              <>
                <Text style={styles.label}>Current rank/belt (optional)</Text>
                <TouchableOpacity
                  style={styles.selectBtn}
                  onPress={() => setShowRankPicker(!showRankPicker)}
                >
                  <Text style={currentRank ? styles.selectText : styles.placeholderText}>
                    {currentRank || 'Select rank/belt...'}
                  </Text>
                  <Text style={styles.chevron}>▼</Text>
                </TouchableOpacity>
                {showRankPicker && (
                  <View style={styles.pickerList}>
                    <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                      {availableBelts.map((b) => (
                        <TouchableOpacity
                          key={b}
                          style={styles.pickerItem}
                          onPress={() => {
                            setCurrentRank(b);
                            setShowRankPicker(false);
                          }}
                        >
                          <Text style={styles.pickerItemText}>{b}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            <Text style={styles.label}>Social links (optional)</Text>
            <TextInput style={styles.input} placeholder="Facebook URL" placeholderTextColor="#6b8693" value={facebookLink} onChangeText={setFacebookLink} />
            <TextInput style={styles.input} placeholder="Instagram URL" placeholderTextColor="#6b8693" value={instagramLink} onChangeText={setInstagramLink} />
            <TextInput style={styles.input} placeholder="Other (website, etc.)" placeholderTextColor="#6b8693" value={otherLink} onChangeText={setOtherLink} />
          </View>

          {/* Step 3: Certification files */}
          <View style={styles.section}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>3</Text>
            </View>
            <Text style={styles.sectionTitle}>Certification documents</Text>
            <Text style={styles.sectionHint}>Upload at least one file (PDF or image). Max 10MB per file.</Text>
            <TouchableOpacity
              style={[styles.uploadArea, errors.uploadedFiles ? styles.inputError : null]}
              onPress={pickFiles}
              activeOpacity={0.8}
            >
              <Text style={styles.uploadIcon}>📤</Text>
              <Text style={styles.uploadText}>Tap to add files</Text>
              <Text style={styles.uploadSub}>PDF or image, max 10MB each</Text>
            </TouchableOpacity>
            {uploadedFiles.length > 0 && (
              <View style={styles.fileList}>
                {uploadedFiles.map((f, i) => (
                  <View key={i} style={styles.fileItem}>
                    <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                    <TouchableOpacity onPress={() => removeFile(i)} hitSlop={8}>
                      <Text style={styles.removeFile}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {errors.uploadedFiles ? <Text style={styles.errorText}>{errors.uploadedFiles}</Text> : null}
          </View>

          {/* Step 4: Questions */}
          <View style={styles.section}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>4</Text>
            </View>
            <Text style={styles.sectionTitle}>A few questions</Text>
            <Text style={styles.sectionHint}>Answer honestly.</Text>
            <Text style={styles.label}>Have you ever had credentials revoked?</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.radioRow} onPress={() => setCredentialsRevoked('yes')}>
                <View style={[styles.radio, credentialsRevoked === 'yes' && styles.radioChecked]} />
                <Text style={styles.radioLabel}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.radioRow} onPress={() => setCredentialsRevoked('no')}>
                <View style={[styles.radio, credentialsRevoked === 'no' && styles.radioChecked]} />
                <Text style={styles.radioLabel}>No</Text>
              </TouchableOpacity>
            </View>
            {credentialsRevoked === 'yes' && (
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="If yes, please explain (optional)"
                placeholderTextColor="#6b8693"
                value={credentialsRevokedExplanation}
                onChangeText={setCredentialsRevokedExplanation}
                multiline
              />
            )}
            <Text style={[styles.label, { marginTop: 16 }]}>Have you been convicted of a felony?</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.radioRow} onPress={() => setFelonyConviction('yes')}>
                <View style={[styles.radio, felonyConviction === 'yes' && styles.radioChecked]} />
                <Text style={styles.radioLabel}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.radioRow} onPress={() => setFelonyConviction('no')}>
                <View style={[styles.radio, felonyConviction === 'no' && styles.radioChecked]} />
                <Text style={styles.radioLabel}>No</Text>
              </TouchableOpacity>
            </View>
            {felonyConviction === 'yes' && (
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="If yes, please explain (optional)"
                placeholderTextColor="#6b8693"
                value={felonyExplanation}
                onChangeText={setFelonyExplanation}
                multiline
              />
            )}
          </View>

          {/* Step 5: Confirm */}
          <View style={styles.section}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>5</Text>
            </View>
            <Text style={styles.sectionTitle}>Almost done</Text>
            <Text style={styles.sectionHint}>Check both boxes, then tap Submit.</Text>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => {
                setCertifyAccurate(!certifyAccurate);
                setErrors((e) => ({ ...e, certifyAccurate: '' }));
              }}
            >
              <View style={[styles.checkbox, certifyAccurate && styles.checkboxChecked]}>
                {certifyAccurate ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <Text style={styles.checkLabel}>I confirm that all information I provided is accurate</Text>
            </TouchableOpacity>
            {errors.certifyAccurate ? <Text style={styles.errorText}>{errors.certifyAccurate}</Text> : null}
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => {
                setAgreeConduct(!agreeConduct);
                setErrors((e) => ({ ...e, agreeConduct: '' }));
              }}
            >
              <View style={[styles.checkbox, agreeConduct && styles.checkboxChecked]}>
                {agreeConduct ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <Text style={styles.checkLabel}>I agree to maintain professional conduct as a trainer</Text>
            </TouchableOpacity>
            {errors.agreeConduct ? <Text style={styles.errorText}>{errors.agreeConduct}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#041527" />
            ) : (
              <Text style={styles.submitBtnText}>Submit application</Text>
            )}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} duration={3000} />
    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#041527' },
  flex: { flex: 1 },
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
  intro: { marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#062731' },
  introTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 8 },
  introSub: { fontSize: 14, color: '#8fa3b0', lineHeight: 20 },
  section: {
    backgroundColor: '#061d2e',
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#0a3645',
  },
  sectionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#07bbc0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sectionBadgeText: { fontSize: 14, fontWeight: '700', color: '#041527' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#07bbc0', marginBottom: 8, textTransform: 'uppercase' },
  sectionHint: { fontSize: 13, color: '#8fa3b0', marginBottom: 16 },
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
  pickerList: { maxHeight: 200, backgroundColor: '#011f36', borderRadius: 8, borderWidth: 1, borderColor: '#0a3645', marginBottom: 16 },
  pickerScroll: { maxHeight: 200 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#0a3645' },
  pickerItemText: { color: '#FFF', fontSize: 15 },
  check: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  uploadArea: {
    borderWidth: 2,
    borderColor: '#07bbc0',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: '#011f36',
  },
  uploadIcon: { fontSize: 32, marginBottom: 8 },
  uploadText: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  uploadSub: { color: '#6b8693', fontSize: 12, marginTop: 4 },
  fileList: { marginBottom: 16 },
  fileItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#011f36', borderRadius: 8, marginBottom: 8 },
  fileName: { color: '#FFF', fontSize: 14, flex: 1 },
  removeFile: { color: '#FF6B6B', fontSize: 18, padding: 4 },
  row: { flexDirection: 'row', gap: 24, marginBottom: 16 },
  radioRow: { flexDirection: 'row', alignItems: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#07bbc0', marginRight: 8 },
  radioChecked: { backgroundColor: '#07bbc0' },
  radioLabel: { color: '#FFF', fontSize: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: '#07bbc0', marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#07bbc0' },
  checkLabel: { color: '#FFF', fontSize: 15, flex: 1 },
  submitBtn: {
    backgroundColor: '#07bbc0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#041527', fontSize: 16, fontWeight: '700' },
});

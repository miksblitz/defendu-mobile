/**
 * TrainerScreen
 * List of approved trainers; open detail and message trainer.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Linking,
  TextInput,
} from 'react-native';
import { AuthController } from '../lib/controllers/AuthController';
import type { User } from '../lib/models/User';
import type { TrainerApplication } from '../lib/models/TrainerApplication';
import { MARTIAL_ARTS } from '../lib/constants/martialArts';

const FACEBOOK_LOGO = require('../assets/images/facebooklogo.png');
const INSTAGRAM_LOGO = require('../assets/images/instagramlogo.png');
const YEARS_OPTIONS = Array.from({ length: 51 }, (_, i) => i.toString());

// --- Types ---
interface TrainerWithData extends User {
  applicationData?: TrainerApplication | null;
}

interface TrainerScreenProps {
  onMessageTrainer?: (uid: string, name: string, photoUrl: string | null) => void;
}

// --- Component ---
export default function TrainerScreen({ onMessageTrainer }: TrainerScreenProps) {
  const [trainers, setTrainers] = useState<TrainerWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imageVersion, setImageVersion] = useState(Date.now());
  const [selectedTrainer, setSelectedTrainer] = useState<TrainerWithData | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTrainerEditModal, setShowTrainerEditModal] = useState(false);
  const [trainerRatingByUid, setTrainerRatingByUid] = useState<Record<string, { averageRating: number; totalReviews: number }>>({});
  const [savingTrainerProfile, setSavingTrainerProfile] = useState(false);
  const [showDefenseStylesPicker, setShowDefenseStylesPicker] = useState(false);
  const [showYearsExpPicker, setShowYearsExpPicker] = useState(false);
  const [showYearsTeachPicker, setShowYearsTeachPicker] = useState(false);
  const [trainerEmail, setTrainerEmail] = useState('');
  const [trainerAcademyName, setTrainerAcademyName] = useState('');
  const [trainerPhone, setTrainerPhone] = useState('');
  const [trainerAddress, setTrainerAddress] = useState('');
  const [trainerDefenseStyles, setTrainerDefenseStyles] = useState<string[]>([]);
  const [trainerYearsExperience, setTrainerYearsExperience] = useState('');
  const [trainerYearsTeaching, setTrainerYearsTeaching] = useState('');
  const [trainerCurrentRank, setTrainerCurrentRank] = useState('');
  const [trainerFacebookLink, setTrainerFacebookLink] = useState('');
  const [trainerInstagramLink, setTrainerInstagramLink] = useState('');
  const [trainerOtherLink, setTrainerOtherLink] = useState('');
  const [trainerAbout, setTrainerAbout] = useState('');

  const loadTrainers = async () => {
    const [user, list] = await Promise.all([
      AuthController.getCurrentUser(),
      AuthController.getApprovedTrainers(),
    ]);
    if (user) setCurrentUserUid(user.uid);
    const trainerIds = list.map((t) => t.uid);
    const ratingSummary = await AuthController.getTrainerRatingSummaries(trainerIds);
    const withData: TrainerWithData[] = list.map((t) => ({ ...t, applicationData: null }));
    withData.sort((a, b) => {
      const aStats = ratingSummary[a.uid];
      const bStats = ratingSummary[b.uid];
      const aReviews = aStats?.totalReviews ?? 0;
      const bReviews = bStats?.totalReviews ?? 0;
      const aAvg = aStats?.averageRating ?? 0;
      const bAvg = bStats?.averageRating ?? 0;
      if (bAvg !== aAvg) return bAvg - aAvg; // highest stars first
      if (bReviews !== aReviews) return bReviews - aReviews; // then most reviewed
      return b.createdAt.getTime() - a.createdAt.getTime(); // then newest
    });
    setTrainers(withData);
    setTrainerRatingByUid(ratingSummary);
    setSelectedTrainer((prev) => (prev ? withData.find((t) => t.uid === prev.uid) ?? prev : prev));
    setImageVersion(Date.now());
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await loadTrainers();
      } catch (e) {
        console.error('load trainers:', e);
        if (!cancelled) setTrainers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const openDetail = async (t: TrainerWithData) => {
    setSelectedTrainer(t);
    setShowDetail(true);
    setDetailLoading(true);
    try {
      const appData = await AuthController.getTrainerApplicationData(t.uid);
      setSelectedTrainer((prev) => (prev && prev.uid === t.uid ? { ...prev, applicationData: appData ?? null } : prev));
    } catch (e) {
      console.error('openDetail:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const fullName = (t: User) => [t.firstName, t.lastName].filter(Boolean).join(' ') || t.username || t.email || 'Trainer';

  const yearLabel = (n: string) => (n === '1' ? 'year' : 'years');
  const valueOrDash = (value?: string | null) => (value && value.trim() ? value.trim() : '—');

  const hasSocialLinks = (app: TrainerApplication | null | undefined) =>
    !!(app?.facebookLink?.trim() || app?.instagramLink?.trim() || app?.otherLink?.trim());

  const openLink = (url: string) => {
    const u = url.trim();
    if (!u) return;
    const toOpen = u.startsWith('http') ? u : `https://${u}`;
    Linking.openURL(toOpen).catch(() => {});
  };

  const openAddress = (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    const encoded = encodeURIComponent(trimmed);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    Linking.openURL(mapUrl).catch(() => {});
  };

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadTrainers();
    } catch (e) {
      console.error('refresh trainers:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleDefenseStyle = (style: string) => {
    setTrainerDefenseStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  const openTrainerEditModal = () => {
    if (!selectedTrainer) return;
    const app = selectedTrainer.applicationData;
    setTrainerEmail(app?.email || selectedTrainer.email || '');
    setTrainerAcademyName(app?.academyName || '');
    setTrainerPhone(app?.phone || '');
    setTrainerAddress(app?.physicalAddress || '');
    setTrainerDefenseStyles(app?.defenseStyles || []);
    setTrainerYearsExperience(app?.yearsOfExperience || '');
    setTrainerYearsTeaching(app?.yearsOfTeaching || '');
    setTrainerCurrentRank(app?.currentRank || '');
    setTrainerFacebookLink(app?.facebookLink || '');
    setTrainerInstagramLink(app?.instagramLink || '');
    setTrainerOtherLink(app?.otherLink || '');
    setTrainerAbout(app?.aboutMe || '');
    setShowDefenseStylesPicker(false);
    setShowYearsExpPicker(false);
    setShowYearsTeachPicker(false);
    setShowTrainerEditModal(true);
  };

  const saveTrainerProfile = async () => {
    if (!selectedTrainer || !currentUserUid || selectedTrainer.uid !== currentUserUid) return;
    setSavingTrainerProfile(true);
    try {
      await AuthController.updateTrainerProfile(currentUserUid, {
        email: trainerEmail,
        academyName: trainerAcademyName,
        phone: trainerPhone,
        physicalAddress: trainerAddress,
        defenseStyles: trainerDefenseStyles,
        yearsOfExperience: trainerYearsExperience,
        yearsOfTeaching: trainerYearsTeaching,
        currentRank: trainerCurrentRank,
        facebookLink: trainerFacebookLink,
        instagramLink: trainerInstagramLink,
        otherLink: trainerOtherLink,
        aboutMe: trainerAbout,
      });
      await loadTrainers();
      setShowTrainerEditModal(false);
    } catch (e) {
      console.error('saveTrainerProfile:', e);
    } finally {
      setSavingTrainerProfile(false);
    }
  };

  const getCoverPhotoUri = (trainer: TrainerWithData): string | null => {
    const app = trainer.applicationData as Record<string, unknown> | undefined;
    const trainerRecord = trainer as Record<string, unknown>;
    const extractUrl = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
        return null;
      }
      if (!value || typeof value !== 'object') return null;
      const obj = value as Record<string, unknown>;
      const knownUrlKeys = ['url', 'uri', 'secure_url', 'secureUrl', 'downloadURL', 'downloadUrl'];
      for (const key of knownUrlKeys) {
        const nested = obj[key];
        if (typeof nested === 'string') {
          const trimmed = nested.trim();
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
        }
      }
      return null;
    };

    // Highest priority: public trainer user profile fields from `users/<uid>`.
    const userCoverCandidates: Array<unknown> = [
      trainerRecord.coverPhoto,
      trainerRecord.coverPhotoUrl,
      trainerRecord.coverPhotoURL,
      trainerRecord.coverImage,
      trainerRecord.coverImageUrl,
      trainerRecord.coverImageURL,
      trainerRecord.bannerPhoto,
      trainerRecord.bannerPhotoUrl,
      trainerRecord.headerPhoto,
    ];
    for (const candidate of userCoverCandidates) {
      const extracted = extractUrl(candidate);
      if (extracted) return extracted;
    }

    const candidates: Array<unknown> = [
      app?.aboutMeImageUrl,
      app?.aboutMeImageURL,
      app?.aboutImageUrl,
      app?.aboutImageURL,
      app?.coverPhoto,
      app?.coverPhotoUrl,
      app?.coverPhotoURL,
      app?.coverImage,
      app?.coverImageUrl,
      app?.coverImageURL,
      app?.photoUrl,
      app?.photoURL,
      app?.imageUrl,
      app?.imageURL,
      app?.cover,
      app?.coverPhotoData,
      app?.coverImageData,
    ];
    for (const candidate of candidates) {
      const extracted = extractUrl(candidate);
      if (extracted) return extracted;
    }

    if (app && typeof app === 'object') {
      for (const [key, value] of Object.entries(app)) {
        if (!/cover|banner|header|about.*image|image.*about/i.test(key)) continue;
        const extracted = extractUrl(value);
        if (extracted) return extracted;
      }
    }

    const uploaded = trainer.applicationData?.uploadedFiles ?? [];
    const firstRemoteImage = uploaded.find((f) => {
      const uri = (f.uri || '').trim();
      const type = (f.type || '').toLowerCase();
      return !!uri && (uri.startsWith('http://') || uri.startsWith('https://')) && type.startsWith('image/');
    });
    if (firstRemoteImage?.uri?.trim()) return firstRemoteImage.uri.trim();
    const profilePicture = (trainer.profilePicture || '').trim();
    if (profilePicture.startsWith('http://') || profilePicture.startsWith('https://')) return profilePicture;
    return null;
  };

  const addImageVersion = (uri: string | null | undefined): string | null => {
    if (!uri) return null;
    const trimmed = uri.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return trimmed;
    return `${trimmed}${trimmed.includes('?') ? '&' : '?'}v=${imageVersion}`;
  };

  const renderCardRating = (trainerUid: string) => {
    const summary = trainerRatingByUid[trainerUid];
    const totalReviews = summary?.totalReviews ?? 0;
    const averageRating = summary?.averageRating ?? 0;
    if (!totalReviews || averageRating <= 0) {
      return <Text style={styles.cardRatingEmpty}>No reviews yet</Text>;
    }
    const roundedForStars = Math.round(averageRating);
    const stars = [1, 2, 3, 4, 5].map((idx) => (idx <= roundedForStars ? '★' : '☆')).join(' ');
    return (
      <View style={styles.cardRatingRow}>
        <Text style={styles.cardRatingStars}>{stars}</Text>
        <Text style={styles.cardRatingText}>{averageRating.toFixed(1)} ({totalReviews})</Text>
      </View>
    );
  };

  const renderDetailRating = (trainerUid: string) => {
    const summary = trainerRatingByUid[trainerUid];
    const totalReviews = summary?.totalReviews ?? 0;
    const averageRating = summary?.averageRating ?? 0;
    if (!totalReviews || averageRating <= 0) {
      return <Text style={styles.detailRatingEmpty}>No reviews yet</Text>;
    }
    const roundedForStars = Math.round(averageRating);
    const stars = [1, 2, 3, 4, 5].map((idx) => (idx <= roundedForStars ? '★' : '☆')).join(' ');
    return (
      <View style={styles.detailRatingRow}>
        <Text style={styles.detailRatingStars}>{stars}</Text>
        <Text style={styles.detailRatingText}>{averageRating.toFixed(1)} ({totalReviews} reviews)</Text>
      </View>
    );
  };

  const filteredTrainers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return trainers;
    return trainers.filter((t) => {
      const name = fullName(t).toLowerCase();
      const stylesFromUser = (t.martialArtsBackground ?? []).join(' ').toLowerCase();
      return name.includes(q) || stylesFromUser.includes(q);
    });
  }, [searchQuery, trainers]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#07bbc0" />
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#07bbc0" colors={['#07bbc0']} />
        }
      >
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#6b8693" style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search trainer or martial art"
            placeholderTextColor="#6b8693"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        {filteredTrainers.length === 0 ? (
          <Text style={styles.emptyText}>No approved trainers yet.</Text>
        ) : (
          filteredTrainers.map((t) => (
            <TouchableOpacity key={t.uid} style={styles.card} onPress={() => openDetail(t)} activeOpacity={0.8}>
              {t.profilePicture ? (
                <Image source={{ uri: addImageVersion(t.profilePicture)! }} style={styles.cardAvatar} />
              ) : (
                <View style={styles.cardAvatarPlaceholder}>
                  <Text style={styles.cardAvatarLetter}>{fullName(t).charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{fullName(t)}</Text>
                {renderCardRating(t.uid)}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={showDetail} transparent animationType="fade" onRequestClose={() => setShowDetail(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowDetail(false)} />
          <View style={styles.modalContent}>
            {selectedTrainer && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Trainer</Text>
                  <TouchableOpacity onPress={() => setShowDetail(false)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.detailCoverWrap}>
                  {getCoverPhotoUri(selectedTrainer) ? (
                    <Image source={{ uri: addImageVersion(getCoverPhotoUri(selectedTrainer))! }} style={styles.detailCoverPhoto} />
                  ) : (
                    <View style={styles.detailCoverPlaceholder}>
                      <Text style={styles.detailCoverPlaceholderText}>No cover photo yet</Text>
                    </View>
                  )}
                  <View style={styles.detailAvatarOverlay}>
                    {selectedTrainer.profilePicture ? (
                      <Image source={{ uri: addImageVersion(selectedTrainer.profilePicture)! }} style={styles.detailAvatar} />
                    ) : (
                      <View style={[styles.cardAvatarPlaceholder, styles.detailAvatar]}>
                        <Text style={styles.detailAvatarLetter}>{fullName(selectedTrainer).charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.detailName}>{fullName(selectedTrainer)}</Text>
                  {renderDetailRating(selectedTrainer.uid)}
                  {detailLoading ? (
                    <View style={styles.detailLoadingWrap}>
                      <ActivityIndicator size="small" color="#07bbc0" />
                      <Text style={styles.detailLoadingText}>Loading trainer details...</Text>
                    </View>
                  ) : null}
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Personal Information</Text>
                    <Text style={styles.detailLabel}>Email:</Text>
                    <Text style={styles.detailText}>{valueOrDash(selectedTrainer.applicationData?.email || selectedTrainer.email)}</Text>
                    <Text style={styles.detailLabel}>Academy Name:</Text>
                    <Text style={styles.detailText}>{valueOrDash(selectedTrainer.applicationData?.academyName)}</Text>
                    <Text style={styles.detailLabel}>Phone:</Text>
                    <Text style={styles.detailText}>{valueOrDash(selectedTrainer.applicationData?.phone)}</Text>
                    <Text style={styles.detailLabel}>Address:</Text>
                    {selectedTrainer.applicationData?.physicalAddress?.trim() ? (
                      <TouchableOpacity onPress={() => openAddress(selectedTrainer.applicationData!.physicalAddress)} activeOpacity={0.7}>
                        <Text style={[styles.detailText, styles.detailLinkText]}>
                          {selectedTrainer.applicationData.physicalAddress.trim()}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.detailText}>—</Text>
                    )}
                  </View>

                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Credentials & Certifications</Text>
                    <Text style={styles.detailLabel}>Defense Styles:</Text>
                    <Text style={styles.detailText}>{valueOrDash(selectedTrainer.applicationData?.defenseStyles?.join(', '))}</Text>
                    <Text style={styles.detailLabel}>Years of Experience:</Text>
                    <Text style={styles.detailText}>
                      {selectedTrainer.applicationData?.yearsOfExperience
                        ? `${selectedTrainer.applicationData.yearsOfExperience} ${yearLabel(selectedTrainer.applicationData.yearsOfExperience)}`
                        : '—'}
                    </Text>
                    <Text style={styles.detailLabel}>Years of Teaching:</Text>
                    <Text style={styles.detailText}>
                      {selectedTrainer.applicationData?.yearsOfTeaching
                        ? `${selectedTrainer.applicationData.yearsOfTeaching} ${yearLabel(selectedTrainer.applicationData.yearsOfTeaching)}`
                        : '—'}
                    </Text>
                    <Text style={styles.detailLabel}>Current Rank:</Text>
                    <Text style={styles.detailText}>{valueOrDash(selectedTrainer.applicationData?.currentRank)}</Text>
                  </View>

                  {hasSocialLinks(selectedTrainer.applicationData) ? (
                    <View style={[styles.detailSocialBlock, styles.detailSectionCard]}>
                      <Text style={styles.detailLabel}>Social media</Text>
                      {selectedTrainer.applicationData?.facebookLink?.trim() ||
                      selectedTrainer.applicationData?.instagramLink?.trim() ? (
                        <View style={styles.detailSocialIconsRow}>
                          {selectedTrainer.applicationData?.facebookLink?.trim() ? (
                            <TouchableOpacity
                              onPress={() => openLink(selectedTrainer.applicationData!.facebookLink!)}
                              style={[
                                styles.socialIconTouchable,
                                selectedTrainer.applicationData?.instagramLink?.trim()
                                  ? styles.socialIconTouchableSpaced
                                  : null,
                              ]}
                              activeOpacity={0.7}
                              accessibilityRole="link"
                              accessibilityLabel="Open Facebook profile"
                            >
                              <Image source={FACEBOOK_LOGO} style={styles.socialIcon} resizeMode="contain" />
                            </TouchableOpacity>
                          ) : null}
                          {selectedTrainer.applicationData?.instagramLink?.trim() ? (
                            <TouchableOpacity
                              onPress={() => openLink(selectedTrainer.applicationData!.instagramLink!)}
                              style={styles.socialIconTouchable}
                              activeOpacity={0.7}
                              accessibilityRole="link"
                              accessibilityLabel="Open Instagram profile"
                            >
                              <Image source={INSTAGRAM_LOGO} style={styles.socialIcon} resizeMode="contain" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                      {selectedTrainer.applicationData?.otherLink?.trim() ? (
                        <TouchableOpacity onPress={() => openLink(selectedTrainer.applicationData!.otherLink!)} style={styles.detailSocialLink} activeOpacity={0.7}>
                          <Text style={styles.detailSocialLinkText}>Other link</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                  {selectedTrainer.applicationData?.aboutMe ? (
                    <View style={[styles.detailAboutBlock, styles.detailSectionCard]}>
                      <Text style={styles.detailLabel}>About</Text>
                      <Text style={styles.detailAboutText}>{selectedTrainer.applicationData.aboutMe}</Text>
                    </View>
                  ) : null}
                </ScrollView>
                {onMessageTrainer && selectedTrainer && selectedTrainer.uid !== currentUserUid && (
                  <View style={styles.messageTrainerButtonWrap}>
                    <TouchableOpacity
                      style={styles.messageTrainerButton}
                      onPress={() => {
                        setShowDetail(false);
                        onMessageTrainer(
                          selectedTrainer.uid,
                          fullName(selectedTrainer),
                          selectedTrainer.profilePicture ?? null
                        );
                      }}
                    >
                      <Text style={styles.messageTrainerButtonText}>Message</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {selectedTrainer && selectedTrainer.uid === currentUserUid && (
                  <View style={styles.messageTrainerButtonWrap}>
                    <TouchableOpacity style={styles.messageTrainerButton} onPress={openTrainerEditModal}>
                      <Text style={styles.messageTrainerButtonText}>Edit trainer profile</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showTrainerEditModal} transparent animationType="slide" onRequestClose={() => setShowTrainerEditModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowTrainerEditModal(false)} />
          <View style={styles.editModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Trainer Profile</Text>
              <TouchableOpacity onPress={() => setShowTrainerEditModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.editLabel}>Email</Text>
              <TextInput style={styles.editInput} value={trainerEmail} onChangeText={setTrainerEmail} placeholder="Email" placeholderTextColor="#6b8693" />
              <Text style={styles.editLabel}>Academy Name</Text>
              <TextInput style={styles.editInput} value={trainerAcademyName} onChangeText={setTrainerAcademyName} placeholder="Academy name" placeholderTextColor="#6b8693" />
              <Text style={styles.editLabel}>Phone</Text>
              <TextInput style={styles.editInput} value={trainerPhone} onChangeText={setTrainerPhone} placeholder="Phone" placeholderTextColor="#6b8693" keyboardType="phone-pad" />
              <Text style={styles.editLabel}>Address</Text>
              <TextInput style={styles.editInput} value={trainerAddress} onChangeText={setTrainerAddress} placeholder="Address" placeholderTextColor="#6b8693" />

              <Text style={styles.editLabel}>Defense Styles</Text>
              <TouchableOpacity style={styles.editSelectBtn} onPress={() => setShowDefenseStylesPicker((v) => !v)}>
                <Text style={trainerDefenseStyles.length ? styles.editSelectText : styles.editPlaceholderText}>
                  {trainerDefenseStyles.length ? trainerDefenseStyles.join(', ') : 'Select styles'}
                </Text>
                <Text style={styles.chevron}>▼</Text>
              </TouchableOpacity>
              {showDefenseStylesPicker ? (
                <View style={styles.editPickerList}>
                  <ScrollView style={styles.editPickerScroll} nestedScrollEnabled>
                    {MARTIAL_ARTS.map((style) => (
                      <TouchableOpacity key={style} style={styles.editPickerItem} onPress={() => toggleDefenseStyle(style)}>
                        <Text style={styles.editPickerItemText}>{style}</Text>
                        {trainerDefenseStyles.includes(style) ? <Text style={styles.editPickerCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <Text style={styles.editLabel}>Years of Experience</Text>
              <TouchableOpacity style={styles.editSelectBtn} onPress={() => setShowYearsExpPicker((v) => !v)}>
                <Text style={trainerYearsExperience ? styles.editSelectText : styles.editPlaceholderText}>
                  {trainerYearsExperience ? `${trainerYearsExperience} ${yearLabel(trainerYearsExperience)}` : 'Select years'}
                </Text>
                <Text style={styles.chevron}>▼</Text>
              </TouchableOpacity>
              {showYearsExpPicker ? (
                <View style={styles.editPickerList}>
                  <ScrollView style={styles.editPickerScroll} nestedScrollEnabled>
                    {YEARS_OPTIONS.map((y) => (
                      <TouchableOpacity key={y} style={styles.editPickerItem} onPress={() => { setTrainerYearsExperience(y); setShowYearsExpPicker(false); }}>
                        <Text style={styles.editPickerItemText}>{y} {yearLabel(y)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <Text style={styles.editLabel}>Years of Teaching</Text>
              <TouchableOpacity style={styles.editSelectBtn} onPress={() => setShowYearsTeachPicker((v) => !v)}>
                <Text style={trainerYearsTeaching ? styles.editSelectText : styles.editPlaceholderText}>
                  {trainerYearsTeaching ? `${trainerYearsTeaching} ${yearLabel(trainerYearsTeaching)}` : 'Select years'}
                </Text>
                <Text style={styles.chevron}>▼</Text>
              </TouchableOpacity>
              {showYearsTeachPicker ? (
                <View style={styles.editPickerList}>
                  <ScrollView style={styles.editPickerScroll} nestedScrollEnabled>
                    {YEARS_OPTIONS.map((y) => (
                      <TouchableOpacity key={y} style={styles.editPickerItem} onPress={() => { setTrainerYearsTeaching(y); setShowYearsTeachPicker(false); }}>
                        <Text style={styles.editPickerItemText}>{y} {yearLabel(y)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <Text style={styles.editLabel}>Current Rank</Text>
              <TextInput style={styles.editInput} value={trainerCurrentRank} onChangeText={setTrainerCurrentRank} placeholder="Rank / belt" placeholderTextColor="#6b8693" />
              <Text style={styles.editLabel}>Facebook Link</Text>
              <TextInput style={styles.editInput} value={trainerFacebookLink} onChangeText={setTrainerFacebookLink} placeholder="https://facebook.com/..." placeholderTextColor="#6b8693" autoCapitalize="none" />
              <Text style={styles.editLabel}>Instagram Link</Text>
              <TextInput style={styles.editInput} value={trainerInstagramLink} onChangeText={setTrainerInstagramLink} placeholder="https://instagram.com/..." placeholderTextColor="#6b8693" autoCapitalize="none" />
              <Text style={styles.editLabel}>Other Link</Text>
              <TextInput style={styles.editInput} value={trainerOtherLink} onChangeText={setTrainerOtherLink} placeholder="Website or other URL" placeholderTextColor="#6b8693" autoCapitalize="none" />
              <Text style={styles.editLabel}>About</Text>
              <TextInput style={[styles.editInput, styles.editInputMultiline]} value={trainerAbout} onChangeText={setTrainerAbout} placeholder="Short bio" placeholderTextColor="#6b8693" multiline />
            </ScrollView>
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editCancelButton} onPress={() => setShowTrainerEditModal(false)}>
                <Text style={styles.editCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editSaveButton, savingTrainerProfile && styles.editSaveButtonDisabled]} onPress={saveTrainerProfile} disabled={savingTrainerProfile}>
                <Text style={styles.editSaveButtonText}>{savingTrainerProfile ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#041527' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 8, paddingBottom: 40 },
  searchWrap: { marginBottom: 10 },
  searchIcon: {
    position: 'absolute',
    right: 14,
    top: 14,
    zIndex: 2,
  },
  searchInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#062731',
    backgroundColor: '#011f36',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingRight: 40,
    fontSize: 14,
  },
  emptyText: { color: '#6b8693', fontSize: 16, textAlign: 'center', marginTop: 24 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#011f36', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#062731' },
  cardAvatar: { width: 56, height: 56, borderRadius: 28, marginRight: 16 },
  cardAvatarPlaceholder: { width: 56, height: 56, borderRadius: 28, marginRight: 16, backgroundColor: '#07bbc0', justifyContent: 'center', alignItems: 'center' },
  cardAvatarLetter: { color: '#041527', fontSize: 24, fontWeight: '700' },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  cardMeta: { color: '#6b8693', fontSize: 14 },
  cardRatingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  cardRatingStars: { color: '#f5c54d', fontSize: 12, letterSpacing: 0.2 },
  cardRatingText: { color: '#d8e6ed', fontSize: 12, fontWeight: '700', marginLeft: 8 },
  cardRatingEmpty: { color: '#5f7e8b', fontSize: 12, marginTop: 6 },
  chevron: { color: '#07bbc0', fontSize: 24, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 20 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: { backgroundColor: '#011f36', borderRadius: 16, borderWidth: 1, borderColor: '#062731', height: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#062731' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  modalClose: { color: '#FFF', fontSize: 24 },
  modalScroll: { flex: 1 },
  modalScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 96 },
  detailCoverWrap: { width: '100%', height: 140, backgroundColor: '#062731', position: 'relative' },
  detailCoverPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  detailCoverPlaceholder: { width: '100%', height: '100%', backgroundColor: '#062731', alignItems: 'center', justifyContent: 'center' },
  detailCoverPlaceholderText: { color: '#6b8693', fontSize: 14, fontWeight: '600' },
  detailAvatarOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#011f36',
    backgroundColor: '#062731',
  },
  detailAvatarLetter: { color: '#041527', fontSize: 36, fontWeight: '700' },
  detailName: { color: '#FFF', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 16, marginTop: 48 },
  detailRatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  detailRatingStars: { color: '#f5c54d', fontSize: 15, letterSpacing: 0.5 },
  detailRatingText: { color: '#d8e6ed', fontSize: 13, fontWeight: '700', marginLeft: 8 },
  detailRatingEmpty: { color: '#6b8693', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  detailLoadingWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  detailLoadingText: { color: '#6b8693', fontSize: 13, marginLeft: 8 },
  detailSectionCard: {
    backgroundColor: '#04253e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0b3b57',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  detailSectionTitle: { color: '#9aeff2', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  detailLabel: { color: '#07bbc0', fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  detailText: { color: '#FFF', fontSize: 14, marginBottom: 8, lineHeight: 20 },
  detailLinkText: { color: '#8de8ff', textDecorationLine: 'underline' },
  detailSocialBlock: { marginTop: 4, marginBottom: 16 },
  detailSocialIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    marginBottom: 10,
  },
  socialIconTouchable: {
    padding: 6,
  },
  /** Space between Facebook and Instagram when both are shown (`gap` is unreliable on some RN builds). */
  socialIconTouchableSpaced: {
    marginRight: 14,
  },
  /** Circular brand assets: no extra plate — sized for consistent visual weight and tap target. */
  socialIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  detailSocialLink: { marginBottom: 8 },
  detailSocialLinkText: { color: '#07bbc0', fontSize: 15, fontWeight: '600' },
  detailAboutBlock: { marginTop: 4, marginBottom: 16 },
  detailAboutText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  messageTrainerButtonWrap: { padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#062731' },
  messageTrainerButton: { backgroundColor: '#07bbc0', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  messageTrainerButtonText: { color: '#041527', fontSize: 16, fontWeight: '700' },
  editModalContent: {
    backgroundColor: '#011f36',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#062731',
    height: '92%',
  },
  editLabel: { color: '#9aeff2', fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  editInput: {
    backgroundColor: '#062731',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0a3645',
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 14,
  },
  editInputMultiline: { minHeight: 84, textAlignVertical: 'top' },
  editSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#062731',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0a3645',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  editSelectText: { color: '#FFF', fontSize: 14, flex: 1 },
  editPlaceholderText: { color: '#6b8693', fontSize: 14, flex: 1 },
  editPickerList: { maxHeight: 180, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: '#0a3645', backgroundColor: '#062731' },
  editPickerScroll: { maxHeight: 180 },
  editPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0a3645',
  },
  editPickerItemText: { color: '#FFF', fontSize: 14, flex: 1 },
  editPickerCheck: { color: '#07bbc0', fontWeight: '700', fontSize: 15 },
  editActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#062731',
    padding: 12,
    gap: 10,
  },
  editCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#6b8693',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  editCancelButtonText: { color: '#6b8693', fontSize: 14, fontWeight: '700' },
  editSaveButton: {
    flex: 1,
    backgroundColor: '#07bbc0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  editSaveButtonDisabled: { opacity: 0.65 },
  editSaveButtonText: { color: '#041527', fontSize: 14, fontWeight: '800' },
});

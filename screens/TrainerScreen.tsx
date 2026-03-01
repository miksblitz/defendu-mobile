import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Linking,
} from 'react-native';
import { AuthController } from '../lib/controllers/AuthController';
import type { User } from '../lib/models/User';
import type { TrainerApplication } from '../lib/models/TrainerApplication';

interface TrainerWithData extends User {
  applicationData?: TrainerApplication | null;
}

interface TrainerScreenProps {
  onMessageTrainer?: (uid: string, name: string, photoUrl: string | null) => void;
}

export default function TrainerScreen({ onMessageTrainer }: TrainerScreenProps) {
  const [trainers, setTrainers] = useState<TrainerWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrainer, setSelectedTrainer] = useState<TrainerWithData | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [user, list] = await Promise.all([
          AuthController.getCurrentUser(),
          AuthController.getApprovedTrainers(),
        ]);
        if (cancelled) return;
        if (user) setCurrentUserUid(user.uid);
        const withData: TrainerWithData[] = [];
        for (const t of list) {
          const appData = await AuthController.getTrainerApplicationData(t.uid);
          withData.push({ ...t, applicationData: appData ?? null });
        }
        if (!cancelled) setTrainers(withData);
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

  const openDetail = (t: TrainerWithData) => {
    setSelectedTrainer(t);
    setShowDetail(true);
  };

  const fullName = (t: User) => [t.firstName, t.lastName].filter(Boolean).join(' ') || t.username || t.email || 'Trainer';

  const yearLabel = (n: string) => (n === '1' ? 'year' : 'years');

  const hasSocialLinks = (app: TrainerApplication | null | undefined) =>
    !!(app?.facebookLink?.trim() || app?.instagramLink?.trim() || app?.otherLink?.trim());

  const openLink = (url: string) => {
    const u = url.trim();
    if (!u) return;
    const toOpen = u.startsWith('http') ? u : `https://${u}`;
    Linking.openURL(toOpen).catch(() => {});
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
        {trainers.length === 0 ? (
          <Text style={styles.emptyText}>No approved trainers yet.</Text>
        ) : (
          trainers.map((t) => (
            <TouchableOpacity key={t.uid} style={styles.card} onPress={() => openDetail(t)} activeOpacity={0.8}>
              {t.profilePicture ? (
                <Image source={{ uri: t.profilePicture }} style={styles.cardAvatar} />
              ) : (
                <View style={styles.cardAvatarPlaceholder}>
                  <Text style={styles.cardAvatarLetter}>{fullName(t).charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{fullName(t)}</Text>
                {t.applicationData?.defenseStyles?.length ? (
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {t.applicationData.defenseStyles.join(', ')}
                  </Text>
                ) : null}
                {t.applicationData?.yearsOfExperience ? (
                  <Text style={styles.cardMeta}>{t.applicationData.yearsOfExperience} {yearLabel(t.applicationData.yearsOfExperience)} experience</Text>
                ) : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={showDetail} transparent animationType="fade" onRequestClose={() => setShowDetail(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDetail(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            {selectedTrainer && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Trainer</Text>
                  <TouchableOpacity onPress={() => setShowDetail(false)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.detailCoverWrap}>
                  {selectedTrainer.applicationData?.aboutMeImageUrl ? (
                    <Image source={{ uri: selectedTrainer.applicationData.aboutMeImageUrl }} style={styles.detailCoverPhoto} />
                  ) : (
                    <View style={styles.detailCoverPlaceholder} />
                  )}
                  <View style={styles.detailAvatarOverlay}>
                    {selectedTrainer.profilePicture ? (
                      <Image source={{ uri: selectedTrainer.profilePicture }} style={styles.detailAvatar} />
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
                >
                  <Text style={styles.detailName}>{fullName(selectedTrainer)}</Text>
                  {selectedTrainer.applicationData?.defenseStyles?.length ? (
                    <>
                      <Text style={styles.detailLabel}>Styles</Text>
                      <Text style={styles.detailText}>{selectedTrainer.applicationData.defenseStyles.join(', ')}</Text>
                    </>
                  ) : null}
                  {selectedTrainer.applicationData?.currentRank ? (
                    <>
                      <Text style={styles.detailLabel}>Rank / belt</Text>
                      <Text style={styles.detailText}>{selectedTrainer.applicationData.currentRank}</Text>
                    </>
                  ) : null}
                  {hasSocialLinks(selectedTrainer.applicationData) ? (
                    <View style={styles.detailSocialBlock}>
                      <Text style={styles.detailLabel}>Social media</Text>
                      {selectedTrainer.applicationData?.facebookLink?.trim() ? (
                        <TouchableOpacity onPress={() => openLink(selectedTrainer.applicationData!.facebookLink!)} style={styles.detailSocialLink} activeOpacity={0.7}>
                          <Text style={styles.detailSocialLinkText}>Facebook</Text>
                        </TouchableOpacity>
                      ) : null}
                      {selectedTrainer.applicationData?.instagramLink?.trim() ? (
                        <TouchableOpacity onPress={() => openLink(selectedTrainer.applicationData!.instagramLink!)} style={styles.detailSocialLink} activeOpacity={0.7}>
                          <Text style={styles.detailSocialLinkText}>Instagram</Text>
                        </TouchableOpacity>
                      ) : null}
                      {selectedTrainer.applicationData?.otherLink?.trim() ? (
                        <TouchableOpacity onPress={() => openLink(selectedTrainer.applicationData!.otherLink!)} style={styles.detailSocialLink} activeOpacity={0.7}>
                          <Text style={styles.detailSocialLinkText}>Other link</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                  {selectedTrainer.applicationData?.aboutMe ? (
                    <View style={styles.detailAboutBlock}>
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
              </>
            )}
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
  content: { padding: 16, paddingTop: 8, paddingBottom: 40 },
  emptyText: { color: '#6b8693', fontSize: 16, textAlign: 'center', marginTop: 24 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#011f36', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#062731' },
  cardAvatar: { width: 56, height: 56, borderRadius: 28, marginRight: 16 },
  cardAvatarPlaceholder: { width: 56, height: 56, borderRadius: 28, marginRight: 16, backgroundColor: '#07bbc0', justifyContent: 'center', alignItems: 'center' },
  cardAvatarLetter: { color: '#041527', fontSize: 24, fontWeight: '700' },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  cardMeta: { color: '#6b8693', fontSize: 14 },
  chevron: { color: '#07bbc0', fontSize: 24, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#011f36', borderRadius: 16, borderWidth: 1, borderColor: '#062731', maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#062731' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  modalClose: { color: '#FFF', fontSize: 24 },
  modalScroll: { flexGrow: 1, maxHeight: 400 },
  modalScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  detailCoverWrap: { width: '100%', height: 140, backgroundColor: '#062731', position: 'relative' },
  detailCoverPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  detailCoverPlaceholder: { width: '100%', height: '100%', backgroundColor: '#062731' },
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
  detailLabel: { color: '#07bbc0', fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  detailText: { color: '#FFF', fontSize: 14, marginBottom: 8, lineHeight: 20 },
  detailSocialBlock: { marginTop: 4, marginBottom: 16 },
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
});

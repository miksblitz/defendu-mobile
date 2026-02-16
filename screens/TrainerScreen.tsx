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
} from 'react-native';
import { AuthController } from '../lib/controllers/AuthController';
import type { User } from '../lib/models/User';
import type { TrainerApplication } from '../lib/models/TrainerApplication';

interface TrainerWithData extends User {
  applicationData?: TrainerApplication | null;
}

interface TrainerScreenProps {
  onBack: () => void;
  onMessageTrainer?: (uid: string, name: string, photoUrl: string | null) => void;
}

export default function TrainerScreen({ onBack, onMessageTrainer }: TrainerScreenProps) {
  const [trainers, setTrainers] = useState<TrainerWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrainer, setSelectedTrainer] = useState<TrainerWithData | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await AuthController.getApprovedTrainers();
        if (cancelled) return;
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#07bbc0" />
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trainers</Text>
      </View>
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
                  <Text style={styles.cardMeta}>{t.applicationData.yearsOfExperience} years experience</Text>
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
                <ScrollView style={styles.modalScroll}>
                  {selectedTrainer.profilePicture ? (
                    <Image source={{ uri: selectedTrainer.profilePicture }} style={styles.detailAvatar} />
                  ) : (
                    <View style={[styles.cardAvatarPlaceholder, styles.detailAvatar]}>
                      <Text style={styles.detailAvatarLetter}>{fullName(selectedTrainer).charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.detailName}>{fullName(selectedTrainer)}</Text>
                  {selectedTrainer.applicationData?.defenseStyles?.length ? (
                    <Text style={styles.detailLabel}>Styles</Text>
                    <Text style={styles.detailText}>{selectedTrainer.applicationData.defenseStyles.join(', ')}</Text>
                  ) : null}
                  {selectedTrainer.applicationData?.yearsOfExperience ? (
                    <>
                      <Text style={styles.detailLabel}>Experience</Text>
                      <Text style={styles.detailText}>{selectedTrainer.applicationData.yearsOfExperience} years</Text>
                    </>
                  ) : null}
                  {selectedTrainer.applicationData?.aboutMe ? (
                    <>
                      <Text style={styles.detailLabel}>About</Text>
                      <Text style={styles.detailText}>{selectedTrainer.applicationData.aboutMe}</Text>
                    </>
                  ) : null}
                  {onMessageTrainer && (
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
                  )}
                </ScrollView>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#062731' },
  backButton: { paddingVertical: 8, paddingRight: 16 },
  backText: { color: '#07bbc0', fontSize: 16, fontWeight: '600' },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
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
  modalScroll: { padding: 16, maxHeight: 400 },
  detailAvatar: { width: 80, height: 80, borderRadius: 40, alignSelf: 'center', marginBottom: 16 },
  detailAvatarLetter: { color: '#041527', fontSize: 36, fontWeight: '700' },
  detailName: { color: '#FFF', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  detailLabel: { color: '#07bbc0', fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  detailText: { color: '#FFF', fontSize: 14, marginBottom: 8 },
  messageTrainerButton: { backgroundColor: '#07bbc0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  messageTrainerButtonText: { color: '#041527', fontSize: 16, fontWeight: '700' },
});

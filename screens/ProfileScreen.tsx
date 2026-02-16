import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { AuthController } from '../lib/controllers/AuthController';

interface ProfileScreenProps {
  onEditProfile?: () => void;
}

export default function ProfileScreen({ onEditProfile }: ProfileScreenProps) {
  const [username, setUsername] = useState('@');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const user = await AuthController.getCurrentUser();
      if (cancelled) return;
      if (user) {
        setUsername(user.username?.startsWith('@') ? user.username : `@${user.username || ''}`);
        setFirstName(user.firstName || '');
        setLastName(user.lastName || '');
        setProfilePicture(user.profilePicture || null);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'User';

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
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarLetter}>{fullName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.displayName}>{fullName}</Text>
        <Text style={styles.username}>{username}</Text>
        {onEditProfile && (
          <TouchableOpacity style={styles.editButton} onPress={onEditProfile}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#041527' },
  scroll: { flex: 1 },
  content: { padding: 24, alignItems: 'center', paddingTop: 16 },
  avatarWrap: { marginBottom: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#062731' },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#07bbc0', justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#041527', fontSize: 40, fontWeight: '700' },
  displayName: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  username: { color: '#6b8693', fontSize: 16, marginBottom: 24 },
  editButton: { borderWidth: 2, borderColor: '#07bbc0', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  editButtonText: { color: '#07bbc0', fontSize: 16, fontWeight: '600' },
});

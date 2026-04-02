import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { ref, update, get } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebaseConfig';
import { getCurrentUser } from './authSession';
import { uploadFileToCloudinary } from './cloudinary';

/** Update profile: name and/or height/weight. Persists to users + skillProfiles (physicalAttributes) and AsyncStorage. */
export async function updateUserProfile(updates: {
  firstName?: string;
  lastName?: string;
  height?: number;
  weight?: number;
}): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  const userUpdates: Record<string, unknown> = {};
  if (updates.firstName !== undefined) userUpdates.firstName = updates.firstName;
  if (updates.lastName !== undefined) userUpdates.lastName = updates.lastName;
  if (updates.height !== undefined) userUpdates.height = updates.height;
  if (updates.weight !== undefined) userUpdates.weight = updates.weight;
  if (Object.keys(userUpdates).length === 0) return;
  await update(ref(db, `users/${currentUser.uid}`), userUpdates);
  if (updates.height !== undefined || updates.weight !== undefined) {
    const snap = await get(ref(db, `skillProfiles/${currentUser.uid}`));
    if (snap.exists()) {
      const data = snap.val();
      const pa = data?.physicalAttributes ?? {};
      await update(ref(db, `skillProfiles/${currentUser.uid}`), {
        physicalAttributes: {
          ...pa,
          ...(updates.height !== undefined && { height: updates.height }),
          ...(updates.weight !== undefined && { weight: updates.weight }),
          age: pa.age ?? 0,
          gender: pa.gender ?? 'Other',
          limitations: pa.limitations ?? null,
        },
      });
    }
  }
  const updatedUser = { ...currentUser, ...userUpdates };
  await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
}

/** Upload a profile picture (camera or gallery URI) to Cloudinary and save URL to user. Returns the new profile picture URL. */
export async function updateProfilePicture(imageUri: string): Promise<string> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  const fileName = `profile_${currentUser.uid}_${Date.now()}.jpg`;
  const downloadURL = await uploadFileToCloudinary(imageUri, 'image', fileName);
  await update(ref(db, `users/${currentUser.uid}`), { profilePicture: downloadURL });
  const updatedUser = { ...currentUser, profilePicture: downloadURL };
  await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
  return downloadURL;
}

/** Change password (requires current password). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  const firebaseUser = auth.currentUser;
  if (!firebaseUser || !currentUser.email) throw new Error('User not authenticated');
  const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
  await reauthenticateWithCredential(firebaseUser, credential);
  await updatePassword(firebaseUser, newPassword);
}

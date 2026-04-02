import { ref, set, update, get } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebaseConfig';
import type { SkillProfile } from '../models/SkillProfile';
import type { User } from '../models/User';
import { getCurrentUser } from './authSession';

export async function saveSkillProfile(profile: SkillProfile): Promise<void> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    await AsyncStorage.removeItem('user');
    throw new Error('Session expired. Please log in again.');
  }
  const uid = firebaseUser.uid;

  const profileForDB = {
    uid,
    physicalAttributes: {
      height: profile.physicalAttributes.height,
      weight: profile.physicalAttributes.weight,
      age: profile.physicalAttributes.age,
      gender: profile.physicalAttributes.gender,
      limitations: profile.physicalAttributes.limitations ?? null,
    },
    preferences: {
      preferredTechnique: profile.preferences.preferredTechnique ?? [],
      trainingGoal: profile.preferences.trainingGoal ?? [],
      targetModulesPerDay: profile.preferences.targetModulesPerDay,
      targetModulesPerWeek: profile.preferences.targetModulesPerWeek,
    },
    pastExperience: {
      experienceLevel: profile.pastExperience.experienceLevel,
      martialArtsBackground: profile.pastExperience.martialArtsBackground ?? [],
      previousTrainingDetails: profile.pastExperience.previousTrainingDetails ?? null,
    },
    fitnessCapabilities: {
      currentFitnessLevel: profile.fitnessCapabilities.currentFitnessLevel,
      trainingFrequency: profile.fitnessCapabilities.trainingFrequency,
      injuries: profile.fitnessCapabilities.injuries ?? null,
    },
    completedAt: profile.completedAt.getTime(),
    updatedAt: Date.now(),
  };

  await set(ref(db, `skillProfiles/${uid}`), profileForDB);

  const userUpdates = {
    hasCompletedSkillProfile: true,
    height: profile.physicalAttributes.height,
    weight: profile.physicalAttributes.weight,
    age: profile.physicalAttributes.age,
    gender: profile.physicalAttributes.gender,
    physicalLimitations: profile.physicalAttributes.limitations ?? null,
    preferredTechnique: profile.preferences.preferredTechnique ?? [],
    trainingGoal: profile.preferences.trainingGoal ?? [],
    targetModulesPerDay: profile.preferences.targetModulesPerDay,
    targetModulesPerWeek: profile.preferences.targetModulesPerWeek,
    experienceLevel: profile.pastExperience.experienceLevel,
    martialArtsBackground: profile.pastExperience.martialArtsBackground ?? [],
    previousTrainingDetails: profile.pastExperience.previousTrainingDetails ?? null,
    currentFitnessLevel: profile.fitnessCapabilities.currentFitnessLevel,
    trainingFrequency: profile.fitnessCapabilities.trainingFrequency,
    currentInjuries: profile.fitnessCapabilities.injuries ?? null,
  };

  await update(ref(db, `users/${uid}`), userUpdates);

  const currentUser = await getCurrentUser();
  const updatedUser = { ...currentUser, ...userUpdates, uid } as User;
  await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
}

/** Fetch skill profile for current user (e.g. for height/weight fallback). */
export async function getSkillProfile(): Promise<{ height: number; weight: number } | null> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;
  const snap = await get(ref(db, `skillProfiles/${currentUser.uid}`));
  if (!snap.exists()) return null;
  const data = snap.val();
  const pa = data?.physicalAttributes;
  if (pa && typeof pa.height === 'number' && typeof pa.weight === 'number') {
    return { height: pa.height, weight: pa.weight };
  }
  return null;
}

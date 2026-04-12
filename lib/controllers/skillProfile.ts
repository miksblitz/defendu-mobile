import { ref, set, update, get } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebaseConfig';
import type { FitnessCapabilities, Preferences, SkillProfile } from '../models/SkillProfile';
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

/** Merge preference / fitness fields into the saved skill profile and sync `users/` (same paths as full save). */
export async function updateSkillProfilePartial(updates: {
  preferences?: Partial<Pick<Preferences, 'targetModulesPerDay' | 'targetModulesPerWeek'>>;
  fitnessCapabilities?: Partial<Pick<FitnessCapabilities, 'trainingFrequency'>>;
}): Promise<void> {
  const full = await getFullSkillProfile();
  if (!full) {
    throw new Error('No skill profile found. Complete setup first.');
  }
  const merged: SkillProfile = {
    ...full,
    preferences: { ...full.preferences, ...(updates.preferences ?? {}) },
    fitnessCapabilities: { ...full.fitnessCapabilities, ...(updates.fitnessCapabilities ?? {}) },
    completedAt: full.completedAt,
  };
  await saveSkillProfile(merged);
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

/** Full skill profile from Realtime DB (for personalized recommendations). */
export async function getFullSkillProfile(): Promise<SkillProfile | null> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;
  const snap = await get(ref(db, `skillProfiles/${currentUser.uid}`));
  if (!snap.exists()) return null;
  const data = snap.val();
  const pa = data?.physicalAttributes;
  const prefs = data?.preferences;
  const past = data?.pastExperience;
  const fit = data?.fitnessCapabilities;
  if (!pa || typeof pa.height !== 'number' || typeof pa.weight !== 'number') return null;

  const completedAtMs = typeof data?.completedAt === 'number' ? data.completedAt : Date.now();
  const updatedAtMs = typeof data?.updatedAt === 'number' ? data.updatedAt : undefined;

  return {
    uid: currentUser.uid,
    physicalAttributes: {
      height: pa.height,
      weight: pa.weight,
      age: typeof pa.age === 'number' ? pa.age : 0,
      gender: pa.gender === 'Male' || pa.gender === 'Female' || pa.gender === 'Other' ? pa.gender : 'Other',
      limitations: typeof pa.limitations === 'string' ? pa.limitations : undefined,
    },
    preferences: {
      preferredTechnique: Array.isArray(prefs?.preferredTechnique)
        ? prefs.preferredTechnique.map(String)
        : [],
      trainingGoal: Array.isArray(prefs?.trainingGoal) ? prefs.trainingGoal.map(String) : [],
      targetModulesPerDay:
        typeof prefs?.targetModulesPerDay === 'number' && prefs.targetModulesPerDay > 0
          ? prefs.targetModulesPerDay
          : 5,
      targetModulesPerWeek:
        typeof prefs?.targetModulesPerWeek === 'number' && prefs.targetModulesPerWeek > 0
          ? prefs.targetModulesPerWeek
          : 35,
    },
    pastExperience: {
      experienceLevel: typeof past?.experienceLevel === 'string' ? past.experienceLevel : 'Some Experience',
      martialArtsBackground: Array.isArray(past?.martialArtsBackground)
        ? past.martialArtsBackground.map(String)
        : [],
      previousTrainingDetails:
        typeof past?.previousTrainingDetails === 'string' ? past.previousTrainingDetails : undefined,
    },
    fitnessCapabilities: {
      currentFitnessLevel:
        typeof fit?.currentFitnessLevel === 'string' ? fit.currentFitnessLevel : 'Moderate',
      trainingFrequency: typeof fit?.trainingFrequency === 'string' ? fit.trainingFrequency : 'Never',
      injuries: typeof fit?.injuries === 'string' ? fit.injuries : undefined,
    },
    completedAt: new Date(completedAtMs),
    updatedAt: updatedAtMs != null ? new Date(updatedAtMs) : undefined,
  };
}

import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, set, get, update } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebaseConfig';
import type { User, RegisterData, LoginData } from '../models/User';
import type { SkillProfile } from '../models/SkillProfile';

function normalizeArray(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => Number(a) - Number(b));
    if (keys.every((k) => !isNaN(Number(k)))) return keys.map((k) => (value as Record<string, string>)[k]);
  }
  return undefined;
}

function getErrorMessage(errorCode: string | undefined): string {
  if (!errorCode) return 'Login failed. Please try again.';
  const code = String(errorCode);
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-not-found':
      return 'No account found with this email. Please check your email or create an account.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Connection error. Please check your internet and try again.';
    case 'PERMISSION_DENIED':
    case 'permission-denied':
      return 'Something went wrong on our end. Please try again later.';
    default:
      break;
  }
  if (code.toLowerCase().includes('user not found') || code.toLowerCase().includes('user data not found')) return 'No account found with this email. Please check your email or create an account.';
  if (code.toLowerCase().includes('wrong password') || code.toLowerCase().includes('incorrect password')) return 'Incorrect password. Please try again.';
  if (code.toLowerCase().includes('invalid') && code.toLowerCase().includes('credential')) return 'Invalid email or password. Please try again.';
  if (code.toLowerCase().includes('network') || code.toLowerCase().includes('connection')) return 'Connection error. Please check your internet and try again.';
  return 'Invalid email or password. Please check your details and try again.';
}

export async function register(data: RegisterData): Promise<User> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
    const firebaseUser = userCredential.user;

    const userDataForDB = {
      uid: firebaseUser.uid,
      email: data.email,
      username: data.username,
      firstName: data.firstName,
      lastName: data.lastName,
      createdAt: Date.now(),
      role: 'individual',
      hasCompletedSkillProfile: false,
      trainerApproved: false,
    };

    await set(ref(db, `users/${firebaseUser.uid}`), userDataForDB);

    return {
      uid: firebaseUser.uid,
      email: data.email,
      username: data.username,
      firstName: data.firstName,
      lastName: data.lastName,
      createdAt: new Date(),
      role: 'individual',
      hasCompletedSkillProfile: false,
      trainerApproved: false,
    };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    const code = err?.code ?? err?.message ?? '';
    throw new Error(getErrorMessage(String(code)), { cause: error });
  }
}

export async function login(data: LoginData): Promise<User> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
    const firebaseUser = userCredential.user;

    const userSnapshot = await get(ref(db, `users/${firebaseUser.uid}`));
    if (!userSnapshot.exists()) {
      throw new Error('User data not found');
    }

    const userDataRaw = userSnapshot.val() as Record<string, unknown>;
    if (userDataRaw.blocked === true) {
      await signOut(auth);
      throw new Error('This account has been blocked. Please contact support for details.');
    }

    const now = Date.now();
    await update(ref(db, `users/${firebaseUser.uid}`), { lastActive: now });

    const userRole = userDataRaw.role === 'admin' ? 'admin' : (userDataRaw.role as string) || 'individual';
    const userData: User = {
      ...userDataRaw,
      uid: firebaseUser.uid,
      email: String(userDataRaw.email),
      username: String(userDataRaw.username),
      firstName: String(userDataRaw.firstName),
      lastName: String(userDataRaw.lastName),
      createdAt: userDataRaw.createdAt ? new Date(userDataRaw.createdAt as number) : new Date(),
      lastActive: new Date(now),
      role: userRole as User['role'],
      hasCompletedSkillProfile: Boolean(userDataRaw.hasCompletedSkillProfile ?? false),
      trainerApproved: Boolean(userDataRaw.trainerApproved ?? false),
      blocked: Boolean(userDataRaw.blocked ?? false),
      preferredTechnique: normalizeArray(userDataRaw.preferredTechnique),
      trainingGoal: normalizeArray(userDataRaw.trainingGoal),
      martialArtsBackground: normalizeArray(userDataRaw.martialArtsBackground),
    } as User;

    await AsyncStorage.setItem('user', JSON.stringify(userData));
    return userData;
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    const code = err?.code ?? err?.message ?? '';
    throw new Error(getErrorMessage(String(code)), { cause: error });
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const userJson = await AsyncStorage.getItem('user');
    if (!userJson) return null;
    const raw = JSON.parse(userJson) as Record<string, unknown>;
    return {
      ...raw,
      uid: String(raw.uid),
      email: String(raw.email),
      username: String(raw.username),
      firstName: String(raw.firstName),
      lastName: String(raw.lastName),
      createdAt: raw.createdAt ? (typeof raw.createdAt === 'string' ? new Date(raw.createdAt) : new Date(raw.createdAt as number)) : new Date(),
      lastActive: raw.lastActive ? (typeof raw.lastActive === 'string' ? new Date(raw.lastActive) : new Date(raw.lastActive as number)) : undefined,
      role: (raw.role as User['role']) || 'individual',
      hasCompletedSkillProfile: Boolean(raw.hasCompletedSkillProfile ?? false),
      trainerApproved: Boolean(raw.trainerApproved ?? false),
      blocked: Boolean(raw.blocked ?? false),
      preferredTechnique: normalizeArray(raw.preferredTechnique),
      trainingGoal: normalizeArray(raw.trainingGoal),
      martialArtsBackground: normalizeArray(raw.martialArtsBackground),
    } as User;
  } catch {
    return null;
  }
}

export async function saveSkillProfile(profile: SkillProfile): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');

  const profileForDB = {
    uid: profile.uid,
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

  await set(ref(db, `skillProfiles/${currentUser.uid}`), profileForDB);

  const userUpdates = {
    hasCompletedSkillProfile: true,
    height: profile.physicalAttributes.height,
    weight: profile.physicalAttributes.weight,
    age: profile.physicalAttributes.age,
    gender: profile.physicalAttributes.gender,
    physicalLimitations: profile.physicalAttributes.limitations ?? null,
    preferredTechnique: profile.preferences.preferredTechnique ?? [],
    trainingGoal: profile.preferences.trainingGoal ?? [],
    experienceLevel: profile.pastExperience.experienceLevel,
    martialArtsBackground: profile.pastExperience.martialArtsBackground ?? [],
    previousTrainingDetails: profile.pastExperience.previousTrainingDetails ?? null,
    currentFitnessLevel: profile.fitnessCapabilities.currentFitnessLevel,
    trainingFrequency: profile.fitnessCapabilities.trainingFrequency,
    currentInjuries: profile.fitnessCapabilities.injuries ?? null,
  };

  await update(ref(db, `users/${currentUser.uid}`), userUpdates);

  const updatedUser = { ...currentUser, ...userUpdates };
  await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
}

export interface ModuleItem {
  moduleId: string;
  moduleTitle?: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  videoDuration?: number;
  createdAt?: Date;
  updatedAt?: Date;
  status?: string;
}

export async function getApprovedModules(): Promise<ModuleItem[]> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    const modulesRef = ref(db, 'modules');
    const snapshot = await get(modulesRef);
    if (!snapshot.exists()) return [];

    const data = snapshot.val() as Record<string, Record<string, unknown>>;
    const modules: ModuleItem[] = [];
    for (const id in data) {
      const item = data[id];
      if (!item || item.status !== 'approved') continue;
      modules.push({
        moduleId: id,
        ...item,
        createdAt: item.createdAt ? new Date(item.createdAt as number) : new Date(),
        updatedAt: item.updatedAt ? new Date(item.updatedAt as number) : new Date(),
      } as ModuleItem);
    }
    modules.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
    return modules;
  } catch (e) {
    console.error('getApprovedModules:', e);
    return [];
  }
}

export async function forgotPassword(data: { email: string }): Promise<string> {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.REACT_APP_API_BASE_URL || 'https://defendu-app.vercel.app';
  const url = `${apiBaseUrl}/api/password-reset`;

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email }),
    });
    text = await response.text();
  } catch (fetchErr: unknown) {
    const err = fetchErr as Error;
    const msg = `Network/request failed. URL: ${url} | Error: ${err?.message ?? String(fetchErr)}`;
    console.error('[forgotPassword]', msg);
    throw new Error(msg);
  }

  let result: { code?: string; message?: string; error?: string };
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    const preview = text ? text.substring(0, 80).replace(/\n/g, ' ') : '(empty)';
    const msg = `Server did not return JSON. Status: ${response.status} | URL: ${url} | Response preview: ${preview}`;
    console.error('[forgotPassword]', msg);
    throw new Error(msg);
  }

  if (!response.ok) {
    if (response.status === 404 && result.code === 'USER_NOT_FOUND') {
      throw new Error('No account found with this email address. Please check your email or create an account.');
    }
    const errorMsg = result.error ?? 'Failed to send password reset email';
    const fullMsg = result.message ? `${errorMsg}: ${result.message}` : errorMsg;
    console.error('[forgotPassword]', response.status, url, result);
    throw new Error(fullMsg);
  }

  return result.message ?? 'Password reset email sent successfully';
}

export async function logout(): Promise<void> {
  try {
    await signOut(auth);
    await AsyncStorage.removeItem('user');
  } catch (e) {
    console.error('Logout error:', e);
  }
}

export const AuthController = { register, login, getCurrentUser, saveSkillProfile, getApprovedModules, forgotPassword, logout };

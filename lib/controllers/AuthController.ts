import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { ref, set, get, update } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db, cloudinaryConfig } from '../config/firebaseConfig';
import type { User, RegisterData, LoginData } from '../models/User';
import type { SkillProfile } from '../models/SkillProfile';
import type { Module } from '../models/Module';
import type { ModuleReview } from '../models/ModuleReview';
import type { TrainerApplication } from '../models/TrainerApplication';

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

    const userData: User = {
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
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    return userData;
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
    if (userRole === 'admin') {
      await signOut(auth);
      throw new Error('Admin login is disabled on mobile. Please use the web dashboard.');
    }
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

/** API base URL for password reset and related endpoints (defendu-mobile Vercel deployment). */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return process.env.EXPO_PUBLIC_API_BASE_URL || process.env.REACT_APP_API_BASE_URL || 'https://defendu-mobile.vercel.app';
}

export async function forgotPassword(data: { email: string }): Promise<string> {
  const apiBaseUrl = getApiBaseUrl();
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
    // 404 with non-JSON (e.g. Vercel HTML or NOT_FOUND page) = route not deployed
    if (response.status === 404) {
      console.error('[forgotPassword] 404 - API route not found. URL:', url);
      throw new Error('Password reset service is currently unavailable. Please try again later or contact support.');
    }
    console.error('[forgotPassword]', 'Non-JSON response. Status:', response.status, 'URL:', url, 'Preview:', preview);
    throw new Error('Server did not respond correctly. Please try again later.');
  }

  if (!response.ok) {
    if (response.status === 404 && result.code === 'USER_NOT_FOUND') {
      throw new Error('No account found with this email address. Please check your email or create an account.');
    }
    // Vercel 404 NOT_FOUND = API route not deployed at this URL
    if (response.status === 404 && (result.code === 'NOT_FOUND' || (result.error && String(result.error).includes('NOT_FOUND')))) {
      console.error('[forgotPassword] 404 NOT_FOUND - API route missing at', url);
      throw new Error('Password reset service is currently unavailable. Please try again later or contact support.');
    }
    const fullMsg = result.message || result.error || 'Failed to send password reset email';
    console.error('[forgotPassword]', response.status, url, result);
    throw new Error(fullMsg);
  }

  return result.message ?? 'Password reset email sent successfully';
}

/** Validate reset token (e.g. when app opens via deep link). */
export async function validateResetToken(token: string): Promise<{ valid: true; email: string } | { valid: false; error: string }> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/validate-reset-token`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.valid === true) return { valid: true, email: data.email };
  return { valid: false, error: data.error || 'Invalid or expired link. Please request a new one.' };
}

/** Submit new password after token validation. */
export async function confirmPasswordReset(token: string, newPassword: string): Promise<string> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/confirm-password-reset`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to reset password');
  return data.message || 'Password reset successfully';
}

export async function logout(): Promise<void> {
  try {
    await signOut(auth);
    await AsyncStorage.removeItem('user');
  } catch (e) {
    console.error('Logout error:', e);
  }
}

// --- Recommendations & progress (from web) ---
export async function getRecommendations(): Promise<{ similarUserIds: string[]; recommendedModuleIds: string[] } | null> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const snap = await get(ref(db, `recommendations/${currentUser.uid}`));
    if (!snap.exists()) return { similarUserIds: [], recommendedModuleIds: [] };
    const data = snap.val();
    const similarUserIds = Array.isArray(data?.similarUserIds) ? data.similarUserIds : [];
    const recommendedModuleIds = Array.isArray(data?.recommendedModuleIds) ? data.recommendedModuleIds : [];
    return { similarUserIds, recommendedModuleIds };
  } catch (e) {
    console.error('getRecommendations:', e);
    return null;
  }
}

export async function getUserProgress(): Promise<{
  completedModuleIds: string[];
  completedCount: number;
  completionTimestamps: Record<string, number>;
}> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { completedModuleIds: [], completedCount: 0, completionTimestamps: {} };
    }
    const snap = await get(ref(db, `userProgress/${currentUser.uid}`));
    if (!snap.exists()) {
      return { completedModuleIds: [], completedCount: 0, completionTimestamps: {} };
    }
    const data = snap.val();
    const completedModuleIds = Array.isArray(data?.completedModuleIds) ? data.completedModuleIds : [];
    const completedCount = typeof data?.completedCount === 'number' ? data.completedCount : completedModuleIds.length;
    const completionTimestamps =
      data?.completionTimestamps && typeof data.completionTimestamps === 'object'
        ? data.completionTimestamps
        : {};
    return { completedModuleIds, completedCount, completionTimestamps };
  } catch (e) {
    console.error('getUserProgress:', e);
    return { completedModuleIds: [], completedCount: 0, completionTimestamps: {} };
  }
}

export async function recordModuleCompletion(moduleId: string): Promise<number> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  const existing = await getUserProgress();
  if (existing.completedModuleIds.includes(moduleId)) return existing.completedCount;
  const completedModuleIds = [...existing.completedModuleIds, moduleId];
  const completedCount = completedModuleIds.length;
  const completionTimestamps = { ...existing.completionTimestamps, [moduleId]: Date.now() };
  await set(ref(db, `userProgress/${currentUser.uid}`), {
    completedModuleIds,
    completedCount,
    completionTimestamps,
    updatedAt: Date.now(),
  });
  return completedCount;
}

/** Reset all progress (completed modules) for the current user. */
export async function resetUserProgress(): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  await set(ref(db, `userProgress/${currentUser.uid}`), {
    completedModuleIds: [],
    completedCount: 0,
    completionTimestamps: {},
    updatedAt: Date.now(),
  });
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

export async function getModulesByIds(moduleIds: string[]): Promise<Module[]> {
  if (!moduleIds.length) return [];
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];
    const modules: Module[] = [];
    for (const moduleId of moduleIds) {
      const m = await getModuleByIdForUser(moduleId);
      if (m) modules.push(m);
    }
    return modules;
  } catch (e) {
    console.error('getModulesByIds:', e);
    return [];
  }
}

export async function getModuleByIdForUser(moduleId: string): Promise<Module | null> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const moduleRef = ref(db, `modules/${moduleId}`);
    const snap = await get(moduleRef);
    if (!snap.exists()) return null;
    const raw = snap.val() as Record<string, unknown>;
    if (raw.status !== 'approved') return null;
    const module: Module = {
      ...raw,
      moduleId,
      moduleTitle: String(raw.moduleTitle ?? ''),
      description: String(raw.description ?? ''),
      category: String(raw.category ?? ''),
      status: (raw.status as Module['status']) || 'draft',
      createdAt: raw.createdAt ? new Date(raw.createdAt as number) : new Date(),
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt as number) : new Date(),
      submittedAt: raw.submittedAt ? new Date(raw.submittedAt as number) : undefined,
      reviewedAt: raw.reviewedAt ? new Date(raw.reviewedAt as number) : undefined,
      spaceRequirements: normalizeArray(raw.spaceRequirements) ?? [],
      physicalDemandTags: normalizeArray(raw.physicalDemandTags) ?? [],
    } as Module;
    return module;
  } catch (e) {
    console.error('getModuleByIdForUser:', e);
    return null;
  }
}

export async function getModuleReviews(moduleId: string): Promise<ModuleReview[]> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];
    const reviewsRef = ref(db, `moduleReviews/${moduleId}`);
    const snapshot = await get(reviewsRef);
    if (!snapshot.exists()) return [];
    const data = snapshot.val() as Record<string, { userName?: string; rating?: number; comment?: string; createdAt?: number }>;
    const list: ModuleReview[] = [];
    for (const uid of Object.keys(data)) {
      const r = data[uid];
      list.push({
        moduleId,
        userId: uid,
        userName: r.userName ?? 'User',
        rating: typeof r.rating === 'number' ? r.rating : 0,
        comment: r.comment ?? undefined,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      });
    }
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return list;
  } catch (e) {
    console.error('getModuleReviews:', e);
    return [];
  }
}

export async function submitModuleReview(moduleId: string, rating: number, comment?: string): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  if (rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');
  const userName =
    currentUser.firstName && currentUser.lastName
      ? `${currentUser.firstName} ${currentUser.lastName}`
      : currentUser.username || 'User';
  const now = Date.now();
  await set(ref(db, `moduleReviews/${moduleId}/${currentUser.uid}`), {
    rating,
    comment: comment?.trim() || null,
    createdAt: now,
    userName,
  });
}

// --- Trainers ---
export async function getApprovedTrainers(): Promise<User[]> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error('User must be authenticated to view trainers');
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    if (!snapshot.exists()) return [];
    const usersData = snapshot.val() as Record<string, Record<string, unknown>>;
    const approvedTrainers: User[] = [];
    for (const uid of Object.keys(usersData)) {
      const userDataRaw = usersData[uid];
      if (!userDataRaw || typeof userDataRaw !== 'object') continue;
      if (userDataRaw.role !== 'trainer' || userDataRaw.trainerApproved !== true) continue;
      approvedTrainers.push({
        ...userDataRaw,
        uid,
        email: String(userDataRaw.email ?? ''),
        username: String(userDataRaw.username ?? ''),
        firstName: String(userDataRaw.firstName ?? ''),
        lastName: String(userDataRaw.lastName ?? ''),
        createdAt: userDataRaw.createdAt ? new Date(userDataRaw.createdAt as number) : new Date(),
        lastActive: userDataRaw.lastActive ? new Date(userDataRaw.lastActive as number) : undefined,
        role: 'trainer',
        hasCompletedSkillProfile: Boolean(userDataRaw.hasCompletedSkillProfile ?? false),
        trainerApproved: true,
        blocked: Boolean(userDataRaw.blocked ?? false),
        preferredTechnique: normalizeArray(userDataRaw.preferredTechnique),
        trainingGoal: normalizeArray(userDataRaw.trainingGoal),
        martialArtsBackground: normalizeArray(userDataRaw.martialArtsBackground),
        profilePicture: userDataRaw.profilePicture != null ? String(userDataRaw.profilePicture) : undefined,
      } as User);
    }
    approvedTrainers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return approvedTrainers;
  } catch (e) {
    console.error('getApprovedTrainers:', e);
    throw e;
  }
}

export async function getTrainerApplicationData(uid: string): Promise<TrainerApplication | null> {
  try {
    const applicationRef = ref(db, `TrainerApplication/${uid}`);
    const snap = await get(applicationRef);
    if (!snap.exists()) return null;
    const data = snap.val() as Record<string, unknown>;
    return {
      ...data,
      uid: String(data.uid),
      appliedDate: data.appliedDate ? new Date(data.appliedDate as number) : new Date(),
    } as TrainerApplication;
  } catch (e) {
    console.error('getTrainerApplicationData:', e);
    return null;
  }
}

/** Get the current user's trainer application (same as getTrainerApplicationData for a given uid). */
export async function getUserTrainerApplication(uid: string): Promise<TrainerApplication | null> {
  return getTrainerApplicationData(uid);
}

/** Update the public trainer profile (what shows on Trainer page). Only approved trainers. */
export async function updateTrainerProfile(
  uid: string,
  updates: {
    defenseStyles?: string[];
    currentRank?: string;
    aboutMe?: string;
    aboutMeImageUrl?: string;
  }
): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.uid !== uid) throw new Error('User must be authenticated');
  if (currentUser.role !== 'trainer' || !currentUser.trainerApproved) {
    throw new Error('Only approved trainers can update their trainer profile');
  }
  const applicationRef = ref(db, `TrainerApplication/${uid}`);
  const patch: Record<string, unknown> = {};
  if (updates.defenseStyles !== undefined) patch.defenseStyles = updates.defenseStyles;
  if (updates.currentRank !== undefined) patch.currentRank = updates.currentRank;
  if (updates.aboutMe !== undefined) patch.aboutMe = updates.aboutMe;
  if (updates.aboutMeImageUrl !== undefined) patch.aboutMeImageUrl = updates.aboutMeImageUrl;
  if (Object.keys(patch).length === 0) return;
  await update(applicationRef, patch);
}

/** Submit or resubmit trainer application; updates user role to trainer and sets trainerApproved to false. */
export async function submitTrainerApplication(data: TrainerApplication): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== data.uid) {
    throw new Error('User must be authenticated to submit application');
  }
  const existing = await getUserTrainerApplication(data.uid);
  if (existing && existing.status !== 'rejected') {
    throw new Error(
      existing.status === 'awaiting review'
        ? 'You already have an application pending. Please wait for review.'
        : 'You cannot submit another application.'
    );
  }
  const applicationData: Record<string, unknown> = {
    uid: data.uid,
    fullLegalName: data.fullLegalName,
    email: data.email,
    appliedDate: data.appliedDate instanceof Date ? data.appliedDate.getTime() : (data.appliedDate as unknown as number),
    status: data.status,
    dateOfBirth: data.dateOfBirth,
    phone: data.phone,
    physicalAddress: data.physicalAddress,
    defenseStyles: data.defenseStyles,
    yearsOfExperience: data.yearsOfExperience,
    yearsOfTeaching: data.yearsOfTeaching,
    uploadedFiles: data.uploadedFiles,
    credentialsRevoked: data.credentialsRevoked,
    felonyConviction: data.felonyConviction,
    certifyAccurate: data.certifyAccurate,
    agreeConduct: data.agreeConduct,
  };
  if (data.professionalAlias?.trim()) applicationData.professionalAlias = data.professionalAlias;
  if (data.academyName?.trim()) applicationData.academyName = data.academyName;
  if (data.currentRank?.trim()) applicationData.currentRank = data.currentRank;
  if (data.facebookLink?.trim()) applicationData.facebookLink = data.facebookLink;
  if (data.instagramLink?.trim()) applicationData.instagramLink = data.instagramLink;
  if (data.otherLink?.trim()) applicationData.otherLink = data.otherLink;
  if (data.credentialsRevokedExplanation?.trim()) applicationData.credentialsRevokedExplanation = data.credentialsRevokedExplanation;
  if (data.felonyExplanation?.trim()) applicationData.felonyExplanation = data.felonyExplanation;
  if (data.aboutMe?.trim()) applicationData.aboutMe = data.aboutMe;

  await set(ref(db, `TrainerApplication/${data.uid}`), applicationData);
  await update(ref(db, `users/${data.uid}`), { role: 'trainer', trainerApproved: false });
}

/** Save module (publish or draft). Only certified trainers. Returns moduleId. */
export async function saveModule(
  moduleData: Omit<Module, 'moduleId' | 'createdAt' | 'updatedAt'>,
  isDraft: boolean = false
): Promise<string> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  if (currentUser.role !== 'trainer' || !currentUser.trainerApproved) {
    throw new Error('Only certified trainers can publish modules');
  }
  const moduleId = `module_${currentUser.uid}_${Date.now()}`;
  const trainerName =
    currentUser.firstName && currentUser.lastName
      ? `${currentUser.firstName} ${currentUser.lastName}`
      : currentUser.username || currentUser.email;
  const now = Date.now();
  const moduleForDB: Record<string, unknown> = {
    moduleId,
    trainerId: currentUser.uid,
    trainerName,
    moduleTitle: moduleData.moduleTitle,
    description: moduleData.description,
    category: moduleData.category,
    introductionType: moduleData.introductionType ?? 'text',
    introduction: moduleData.introduction ?? null,
    introductionVideoUrl: moduleData.introductionVideoUrl ?? null,
    techniqueVideoUrl: moduleData.techniqueVideoUrl ?? null,
    techniqueVideoLink: moduleData.techniqueVideoLink ?? null,
    videoDuration: moduleData.videoDuration ?? null,
    thumbnailUrl: moduleData.thumbnailUrl ?? null,
    intensityLevel: moduleData.intensityLevel ?? 2,
    spaceRequirements: moduleData.spaceRequirements ?? [],
    physicalDemandTags: moduleData.physicalDemandTags ?? [],
    repRange: moduleData.repRange ?? null,
    difficultyLevel: moduleData.difficultyLevel ?? null,
    trainingDurationSeconds: moduleData.trainingDurationSeconds ?? null,
    status: isDraft ? 'draft' : 'pending review',
    createdAt: now,
    updatedAt: now,
    submittedAt: isDraft ? null : now,
    certificationChecked: Boolean(moduleData.certificationChecked),
  };
  await set(ref(db, `modules/${moduleId}`), moduleForDB);
  await set(ref(db, `trainerModules/${currentUser.uid}/${moduleId}`), {
    moduleId,
    moduleTitle: moduleData.moduleTitle,
    status: moduleForDB.status,
    createdAt: now,
    updatedAt: now,
  });
  return moduleId;
}

/** Upload video or image to Cloudinary; returns secure URL. */
export async function uploadFileToCloudinary(
  fileUri: string,
  fileType: 'image' | 'video',
  fileName: string
): Promise<string> {
  const resourceType = fileType === 'video' ? 'video' : 'image';
  const publicId = `${fileType}_${Date.now()}_${(fileName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const formData = new FormData();
  (formData as any).append('file', {
    uri: fileUri,
    name: fileName || (fileType === 'video' ? 'video.mp4' : 'image.jpg'),
    type: fileType === 'video' ? 'video/mp4' : 'image/jpeg',
  });
  formData.append('upload_preset', cloudinaryConfig.uploadPreset);
  formData.append('public_id', publicId);
  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`;
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to upload ${fileType}`);
  }
  const data = await res.json();
  return data.secure_url;
}

export const AuthController = {
  register,
  login,
  getCurrentUser,
  saveSkillProfile,
  getSkillProfile,
  updateUserProfile,
  updateProfilePicture,
  resetUserProgress,
  changePassword,
  getApprovedModules,
  forgotPassword,
  logout,
  getRecommendations,
  getUserProgress,
  recordModuleCompletion,
  getModulesByIds,
  getModuleByIdForUser,
  getModuleReviews,
  submitModuleReview,
  getApprovedTrainers,
  getTrainerApplicationData,
  getUserTrainerApplication,
  updateTrainerProfile,
  submitTrainerApplication,
  saveModule,
  uploadFileToCloudinary,
};

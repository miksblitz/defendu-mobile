import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { ref, set, get, update } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebaseConfig';
import type { User, RegisterData, LoginData } from '../models/User';
import { getErrorMessage } from './errors';
import { normalizeArray, normalizeNumber } from './normalize';

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
    await AsyncStorage.removeItem('user');
    await signOut(auth).catch(() => {});
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
      targetModulesPerDay: normalizeNumber(userDataRaw.targetModulesPerDay),
      targetModulesPerWeek: normalizeNumber(userDataRaw.targetModulesPerWeek),
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
      targetModulesPerDay: normalizeNumber(raw.targetModulesPerDay),
      targetModulesPerWeek: normalizeNumber(raw.targetModulesPerWeek),
      martialArtsBackground: normalizeArray(raw.martialArtsBackground),
    } as User;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await signOut(auth);
    await AsyncStorage.removeItem('user');
  } catch (e) {
    console.error('Logout error:', e);
  }
}

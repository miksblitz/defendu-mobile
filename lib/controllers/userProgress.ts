import { ref, get, set } from 'firebase/database';
import { db } from '../config/firebaseConfig';
import { getCurrentUser } from './authSession';

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

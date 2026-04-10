/**
 * Per-user progress lives in a single RTDB node: `userProgress/{uid}`.
 * Growth is bounded by catalog size, not by how often someone trains:
 * - `completionTimestamps`: one timestamp per module; updated on each successful completion so weekly/day UI reflects latest finish time.
 * - `completedModuleIds` / `completedCount`: same bound.
 * - `moduleTrainingStats`: one small object per module the user has failed at least once.
 * Weekly UI windows filter by date client-side; old timestamps are not duplicated.
 */
import { ref, get, set } from 'firebase/database';
import { db } from '../config/firebaseConfig';
import { getCurrentUser } from './authSession';

export type ModuleTrainingStat = { failCount: number; lastFailedAt?: number };

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

function parseModuleTrainingStats(raw: unknown): Record<string, ModuleTrainingStat> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ModuleTrainingStat> = {};
  for (const [moduleId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!moduleId || !v || typeof v !== 'object') continue;
    const failCount = (v as { failCount?: unknown }).failCount;
    const lastFailedAt = (v as { lastFailedAt?: unknown }).lastFailedAt;
    if (typeof failCount === 'number' && failCount >= 0) {
      out[moduleId] = {
        failCount: Math.min(1000, Math.floor(failCount)),
        lastFailedAt: typeof lastFailedAt === 'number' ? lastFailedAt : undefined,
      };
    }
  }
  return out;
}

export async function getUserProgress(): Promise<{
  completedModuleIds: string[];
  completedCount: number;
  completionTimestamps: Record<string, number>;
  moduleTrainingStats: Record<string, ModuleTrainingStat>;
}> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { completedModuleIds: [], completedCount: 0, completionTimestamps: {}, moduleTrainingStats: {} };
    }
    const snap = await get(ref(db, `userProgress/${currentUser.uid}`));
    if (!snap.exists()) {
      return { completedModuleIds: [], completedCount: 0, completionTimestamps: {}, moduleTrainingStats: {} };
    }
    const data = snap.val();
    const completedModuleIds = Array.isArray(data?.completedModuleIds) ? data.completedModuleIds : [];
    const completedCount = typeof data?.completedCount === 'number' ? data.completedCount : completedModuleIds.length;
    const rawTs = data?.completionTimestamps;
    const completionTimestamps: Record<string, number> = {};
    if (rawTs && typeof rawTs === 'object' && !Array.isArray(rawTs)) {
      for (const [k, v] of Object.entries(rawTs as Record<string, unknown>)) {
        if (!k) continue;
        const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
        if (Number.isFinite(n)) completionTimestamps[k] = n;
      }
    }
    const moduleTrainingStats = parseModuleTrainingStats(data?.moduleTrainingStats);
    return { completedModuleIds, completedCount, completionTimestamps, moduleTrainingStats };
  } catch (e) {
    console.error('getUserProgress:', e);
    return { completedModuleIds: [], completedCount: 0, completionTimestamps: {}, moduleTrainingStats: {} };
  }
}

export async function recordModuleCompletion(moduleId: string): Promise<number> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  const id = String(moduleId ?? '').trim();
  if (!id) throw new Error('Missing moduleId');

  const existing = await readProgressForWrite();
  const alreadyCompleted = existing.completedModuleIds.includes(id);
  const completedModuleIds = alreadyCompleted ? existing.completedModuleIds : [...existing.completedModuleIds, id];
  const completedCount = completedModuleIds.length;
  // Always bump timestamp so dashboard weekly/day views show this completion (repeat finishes count for "this week").
  const completionTimestamps = { ...existing.completionTimestamps, [id]: Date.now() };
  const moduleTrainingStats = { ...existing.moduleTrainingStats };
  delete moduleTrainingStats[id];
  await set(ref(db, `userProgress/${currentUser.uid}`), {
    completedModuleIds,
    completedCount,
    completionTimestamps,
    moduleTrainingStats,
    updatedAt: Date.now(),
  });
  return completedCount;
}

/** Record a failed training attempt (e.g. timer ran out before rep goal) for recommendations. */
export async function recordModuleTrainingFailure(moduleId: string): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  if (!moduleId) return;
  const existing = await readProgressForWrite();
  const prev = existing.moduleTrainingStats[moduleId]?.failCount ?? 0;
  const moduleTrainingStats = {
    ...existing.moduleTrainingStats,
    [moduleId]: { failCount: prev + 1, lastFailedAt: Date.now() },
  };
  await set(ref(db, `userProgress/${currentUser.uid}`), {
    completedModuleIds: existing.completedModuleIds,
    completedCount: existing.completedCount,
    completionTimestamps: existing.completionTimestamps,
    moduleTrainingStats,
    updatedAt: Date.now(),
  });
}

async function readProgressForWrite(): Promise<{
  completedModuleIds: string[];
  completedCount: number;
  completionTimestamps: Record<string, number>;
  moduleTrainingStats: Record<string, ModuleTrainingStat>;
}> {
  const p = await getUserProgress();
  return {
    completedModuleIds: p.completedModuleIds,
    completedCount: p.completedCount,
    completionTimestamps: p.completionTimestamps,
    moduleTrainingStats: p.moduleTrainingStats,
  };
}

/** Reset all progress (completed modules) for the current user. */
export async function resetUserProgress(): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  await set(ref(db, `userProgress/${currentUser.uid}`), {
    completedModuleIds: [],
    completedCount: 0,
    completionTimestamps: {},
    moduleTrainingStats: {},
    updatedAt: Date.now(),
  });
}

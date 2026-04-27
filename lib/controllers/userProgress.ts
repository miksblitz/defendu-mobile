/**
 * Per-user progress lives in a single RTDB node: `userProgress/{uid}`.
 * Growth is bounded by catalog size, not by how often someone trains:
 * - `completionTimestamps`: one timestamp per module; updated on each successful completion so weekly/day UI reflects latest finish time.
 * - `completedModuleIds` / `completedCount`: same bound.
 * - `moduleTrainingStats`: one small object per module the user has failed at least once.
 * Weekly UI windows filter by date client-side; old timestamps are not duplicated.
 */
import { ref, get, set, update } from 'firebase/database';
import { db } from '../config/firebaseConfig';
import { getCurrentUser, updateStoredUserCredits } from './authSession';

export type ModuleTrainingStat = { failCount: number; lastFailedAt?: number };

export type WeeklyReward = {
  weekKey: string;
  credits: number;
  reachedAt: number;
  claimedAt?: number;
};

function getCurrentWeekBoundsLocal(nowMs: number = Date.now()): { startMs: number; endMs: number; weekKey: string } {
  const now = new Date(nowMs);
  const dayOfWeek = now.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const weekKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return { startMs: start.getTime(), endMs: end.getTime(), weekKey };
}

function countCompletionsInRange(completionTimestamps: Record<string, number>, startMs: number, endMs: number): number {
  let count = 0;
  for (const ts of Object.values(completionTimestamps)) {
    if (ts >= startMs && ts <= endMs) count += 1;
  }
  return count;
}

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
  weeklyReward: WeeklyReward | null;
}> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { completedModuleIds: [], completedCount: 0, completionTimestamps: {}, moduleTrainingStats: {}, weeklyReward: null };
    }
    const snap = await get(ref(db, `userProgress/${currentUser.uid}`));
    if (!snap.exists()) {
      return { completedModuleIds: [], completedCount: 0, completionTimestamps: {}, moduleTrainingStats: {}, weeklyReward: null };
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
    const rawWeekly = data?.weeklyReward;
    const weeklyReward: WeeklyReward | null =
      rawWeekly
      && typeof rawWeekly === 'object'
      && typeof (rawWeekly as { weekKey?: unknown }).weekKey === 'string'
      && typeof (rawWeekly as { credits?: unknown }).credits === 'number'
      && typeof (rawWeekly as { reachedAt?: unknown }).reachedAt === 'number'
        ? {
            weekKey: (rawWeekly as { weekKey: string }).weekKey,
            credits: (rawWeekly as { credits: number }).credits,
            reachedAt: (rawWeekly as { reachedAt: number }).reachedAt,
            claimedAt:
              typeof (rawWeekly as { claimedAt?: unknown }).claimedAt === 'number'
                ? (rawWeekly as { claimedAt: number }).claimedAt
                : undefined,
          }
        : null;
    return { completedModuleIds, completedCount, completionTimestamps, moduleTrainingStats, weeklyReward };
  } catch (e) {
    console.error('getUserProgress:', e);
    return { completedModuleIds: [], completedCount: 0, completionTimestamps: {}, moduleTrainingStats: {}, weeklyReward: null };
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
  let weeklyReward: WeeklyReward | null = existing.weeklyReward ?? null;

  const userSnap = await get(ref(db, `users/${currentUser.uid}`));
  const userData = userSnap.exists() ? (userSnap.val() as Record<string, unknown>) : {};
  const weeklyTargetRaw = userData?.targetModulesPerWeek;
  const dailyTargetRaw = userData?.targetModulesPerDay;
  const weeklyTarget =
    typeof weeklyTargetRaw === 'number' && weeklyTargetRaw > 0 ? Math.floor(weeklyTargetRaw) : 35;
  const dailyTarget =
    typeof dailyTargetRaw === 'number' && dailyTargetRaw > 0 ? Math.floor(dailyTargetRaw) : 5;

  const { startMs, endMs, weekKey } = getCurrentWeekBoundsLocal();
  const completionsThisWeek = countCompletionsInRange(completionTimestamps, startMs, endMs);
  const reachedWeeklyGoal = completionsThisWeek >= weeklyTarget;
  const rewardAlreadyGrantedThisWeek = weeklyReward?.weekKey === weekKey;

  if (reachedWeeklyGoal && !rewardAlreadyGrantedThisWeek) {
    const rewardCredits = weeklyTarget + dailyTarget;
    weeklyReward = { weekKey, credits: rewardCredits, reachedAt: Date.now() };
  }

  await set(ref(db, `userProgress/${currentUser.uid}`), {
    completedModuleIds,
    completedCount,
    completionTimestamps,
    moduleTrainingStats,
    weeklyReward,
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
    weeklyReward: existing.weeklyReward ?? null,
    updatedAt: Date.now(),
  });
}

export async function claimWeeklyGoalReward(): Promise<{
  claimed: boolean;
  creditsAwarded: number;
  newCredits: number;
  weeklyReward: WeeklyReward | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');

  const existing = await readProgressForWrite();
  const { weekKey } = getCurrentWeekBoundsLocal();
  const reward = existing.weeklyReward;
  if (!reward || reward.weekKey !== weekKey || reward.claimedAt != null) {
    return { claimed: false, creditsAwarded: 0, newCredits: 0, weeklyReward: reward ?? null };
  }

  const userSnap = await get(ref(db, `users/${currentUser.uid}`));
  const userData = userSnap.exists() ? (userSnap.val() as Record<string, unknown>) : {};
  const currentCredits =
    typeof userData?.credits === 'number' && Number.isFinite(userData.credits) ? userData.credits : 0;
  const newCredits = currentCredits + reward.credits;

  await update(ref(db, `users/${currentUser.uid}`), { credits: newCredits });
  await updateStoredUserCredits(newCredits);

  const claimedReward: WeeklyReward = { ...reward, claimedAt: Date.now() };
  await update(ref(db, `userProgress/${currentUser.uid}`), {
    weeklyReward: claimedReward,
    updatedAt: Date.now(),
  });

  return {
    claimed: true,
    creditsAwarded: reward.credits,
    newCredits,
    weeklyReward: claimedReward,
  };
}

async function readProgressForWrite(): Promise<{
  completedModuleIds: string[];
  completedCount: number;
  completionTimestamps: Record<string, number>;
  moduleTrainingStats: Record<string, ModuleTrainingStat>;
  weeklyReward: WeeklyReward | null;
}> {
  const p = await getUserProgress();
  return {
    completedModuleIds: p.completedModuleIds,
    completedCount: p.completedCount,
    completionTimestamps: p.completionTimestamps,
    moduleTrainingStats: p.moduleTrainingStats,
    weeklyReward: p.weeklyReward,
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
    weeklyReward: null,
    updatedAt: Date.now(),
  });
}

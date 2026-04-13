import { ref, get, set, update, runTransaction } from 'firebase/database';
import { db } from '../config/firebaseConfig';
import type { Module } from '../models/Module';
import type { ModuleReview } from '../models/ModuleReview';
import { SEED_TEST_MODULES } from '../seed/testModules';
import { getCurrentUser } from './authSession';
import { normalizeArray, normalizeWarmupExercises } from './normalize';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getModulesByIds(moduleIds: string[]): Promise<Module[]> {
  if (!moduleIds.length) return [];
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];
    const results = await Promise.all(moduleIds.map((id) => getModuleByIdForUser(id)));
    return results.filter((m): m is Module => m != null);
  } catch (e) {
    console.error('getModulesByIds:', e);
    return [];
  }
}

/** Fetch reference pose data from referencePoseData/{moduleId} (keeps module doc small). */
export async function getReferencePoseData(moduleId: string): Promise<{ sequences: unknown[]; focus: string } | null> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const refDataRef = ref(db, `referencePoseData/${moduleId}`);
    const snap = await get(refDataRef);
    if (!snap.exists()) return null;
    const data = snap.val() as { sequences?: unknown[] | Record<string, unknown>; focus?: string };
    const raw = data?.sequences;
    let sequences: unknown[] = [];
    if (Array.isArray(raw)) {
      sequences = raw;
    } else if (raw && typeof raw === 'object') {
      const keys = Object.keys(raw)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b));
      sequences = keys.map((k) => (raw as Record<string, unknown>)[k]);
    }
    if (sequences.length === 0) return null;
    return { sequences, focus: data?.focus ?? 'full' };
  } catch (e) {
    console.error('getReferencePoseData:', e);
    return null;
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
      warmupExercises: normalizeWarmupExercises(raw.warmupExercises),
      cooldownExercises: normalizeArray(raw.cooldownExercises) ?? [],
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
    techniqueVideoUrl2: moduleData.techniqueVideoUrl2 ?? null,
    techniqueVideoLink: moduleData.techniqueVideoLink ?? null,
    referencePoseSequenceUrl: moduleData.referencePoseSequenceUrl ?? null,
    referencePoseVideoUrlSide1: moduleData.referencePoseVideoUrlSide1 ?? null,
    referencePoseVideoUrlSide2: moduleData.referencePoseVideoUrlSide2 ?? null,
    videoDuration: moduleData.videoDuration ?? null,
    thumbnailUrl: moduleData.thumbnailUrl ?? null,
    intensityLevel: moduleData.intensityLevel ?? 2,
    spaceRequirements: moduleData.spaceRequirements ?? [],
    warmupExercises: normalizeWarmupExercises(moduleData.warmupExercises),
    cooldownExercises: moduleData.cooldownExercises ?? [],
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
    submittedAt: isDraft ? null : now,
  });
  return moduleId;
}

/** Patch media URLs on an existing module (after uploads complete). Used to keep publish flow fast: save module first, then upload and patch. */
export async function updateModuleMedia(
  moduleId: string,
  media: {
    techniqueVideoUrl?: string | null;
    thumbnailUrl?: string | null;
    referencePoseVideoUrlSide1?: string | null;
    introductionVideoUrl?: string | null;
  }
): Promise<void> {
  const updates: Record<string, unknown> = {
    updatedAt: Date.now(),
  };
  if (media.techniqueVideoUrl !== undefined) updates.techniqueVideoUrl = media.techniqueVideoUrl;
  if (media.thumbnailUrl !== undefined) updates.thumbnailUrl = media.thumbnailUrl;
  if (media.referencePoseVideoUrlSide1 !== undefined) updates.referencePoseVideoUrlSide1 = media.referencePoseVideoUrlSide1;
  if (media.introductionVideoUrl !== undefined) updates.introductionVideoUrl = media.introductionVideoUrl;
  await update(ref(db, `modules/${moduleId}`), updates);
}

/** Remove a module (e.g. when save succeeded but upload failed, to avoid orphan). */
export async function removeModule(moduleId: string): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  const modRef = ref(db, `modules/${moduleId}`);
  const snap = await get(modRef);
  if (snap.val()?.trainerId !== currentUser.uid) throw new Error('Not allowed to remove this module');
  await set(modRef, null);
  await set(ref(db, `trainerModules/${currentUser.uid}/${moduleId}`), null);
}

/** Seed test modules (approved trainers only). Writes approved modules under current trainer. */
export async function seedTestModules(): Promise<{ added: number }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  if (currentUser.role !== 'trainer' || !currentUser.trainerApproved) {
    throw new Error('Only approved trainers can seed test modules');
  }
  const trainerName =
    currentUser.firstName && currentUser.lastName
      ? `${currentUser.firstName} ${currentUser.lastName}`
      : currentUser.username || currentUser.email;
  const now = Date.now();
  let added = 0;
  for (let i = 0; i < SEED_TEST_MODULES.length; i++) {
    const m = SEED_TEST_MODULES[i];
    const moduleId = `module_${currentUser.uid}_seed_${now}_${i}`;
    const payload = {
      moduleId,
      referenceCode: m.referenceCode ?? null,
      trainerId: currentUser.uid,
      trainerName,
      moduleTitle: m.moduleTitle,
      description: m.description,
      category: m.category,
      difficultyLevel: m.difficultyLevel,
      introductionType: 'text',
      introduction: m.introduction ?? null,
      introductionVideoUrl: null,
      techniqueVideoUrl: null,
      techniqueVideoLink: null,
      videoDuration: m.videoDuration ?? null,
      thumbnailUrl: null,
      intensityLevel: 2,
      spaceRequirements: [],
      warmupExercises: [],
      cooldownExercises: [],
      physicalDemandTags: [],
      repRange: m.repRange ?? null,
      trainingDurationSeconds: m.trainingDurationSeconds ?? null,
      referencePoseFocus: m.referencePoseFocus ?? null,
      hasReferencePose: m.hasReferencePose ?? false,
      status: 'approved',
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
      certificationChecked: true,
    };
    await set(ref(db, `modules/${moduleId}`), payload);
    await set(ref(db, `trainerModules/${currentUser.uid}/${moduleId}`), {
      moduleId,
      moduleTitle: m.moduleTitle,
      status: 'approved',
      createdAt: now,
      updatedAt: now,
    });
    added++;
  }
  return { added };
}

function toCategoryReviewKey(category: string): string {
  return String(category ?? '')
    .trim()
    .toLowerCase()
    .replace(/[#$.[\]\/]/g, '_');
}

function categoryReviewKeyCandidates(category: string): string[] {
  const raw = String(category ?? '').trim();
  const lower = raw.toLowerCase();
  const normalized = toCategoryReviewKey(category);
  const underscored = lower.replace(/\s+/g, '_');
  return Array.from(new Set([normalized, lower, underscored].filter(Boolean)));
}

function isPermissionDeniedError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error ?? '').toLowerCase();
  return message.includes('permission denied');
}

function localCategoryReviewKey(uid: string, categoryKey: string): string {
  return `categoryReview:${uid}:${categoryKey}`;
}

function localCategoryReviewKeyCandidates(uid: string, category: string): string[] {
  const keys = categoryReviewKeyCandidates(category);
  return Array.from(new Set(keys.map((k) => localCategoryReviewKey(uid, k))));
}

function parseCategoryReviewValue(raw: Record<string, unknown>): {
  rating?: number;
  comment?: string;
  trainerRatings?: Record<string, number>;
  createdAt?: number;
} {
  const ratingRaw = Number(raw.rating ?? 0);
  const rating = Number.isFinite(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : undefined;
  const trainerRatingsRaw = raw.trainerRatings as Record<string, unknown> | undefined;
  const trainerRatings: Record<string, number> = {};
  if (trainerRatingsRaw && typeof trainerRatingsRaw === 'object') {
    for (const [uid, value] of Object.entries(trainerRatingsRaw)) {
      const n = Number(value);
      if (!uid?.trim()) continue;
      if (!Number.isFinite(n) || n < 1 || n > 5) continue;
      trainerRatings[uid.trim()] = n;
    }
  }
  const hasTrainerRatings = Object.keys(trainerRatings).length > 0;
  const comment = typeof raw.comment === 'string' ? raw.comment : undefined;
  const createdAtRaw = raw.createdAt;
  const createdAt =
    typeof createdAtRaw === 'number' && Number.isFinite(createdAtRaw) ? createdAtRaw : undefined;
  return {
    rating,
    comment,
    trainerRatings: hasTrainerRatings ? trainerRatings : undefined,
    createdAt,
  };
}

function isMeaningfulCategoryReview(parsed: {
  rating?: number;
  comment?: string;
  trainerRatings?: Record<string, number>;
}): boolean {
  return Boolean(parsed.rating || Object.keys(parsed.trainerRatings ?? {}).length || parsed.comment?.trim());
}

const PENDING_CATEGORY_REVIEW_PROMPT_KEY = 'pendingCategoryReviewPrompt';

export type PendingCategoryReviewPrompt = {
  category: string;
  trainers: Array<{ uid: string; name: string }>;
};

async function persistTrainerRatingsToDb(args: {
  category: string;
  categoryKey: string;
  comment: string | undefined;
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>;
  trainerRatings: Record<string, number>;
}): Promise<void> {
  const { category, categoryKey, comment, currentUser, trainerRatings } = args;
  if (!currentUser) return;
  const userName =
    currentUser.firstName && currentUser.lastName
      ? `${currentUser.firstName} ${currentUser.lastName}`
      : currentUser.username || 'User';
  const now = Date.now();
  const reviewKey = `${currentUser.uid}_${categoryKey}`;
  await Promise.all(
    Object.entries(trainerRatings).map(async ([trainerUid, rating]) => {
      const uid = String(trainerUid ?? '').trim();
      if (!uid) return;
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;
      const reviewRef = ref(db, `trainerRatings/${uid}/reviews/${reviewKey}`);
      const statsRef = ref(db, `trainerRatings/${uid}/stats`);
      let previousRating: number | null = null;
      try {
        const existing = await get(reviewRef);
        if (existing.exists()) {
          const prev = Number((existing.val() as Record<string, unknown>)?.rating ?? 0);
          if (Number.isFinite(prev) && prev >= 1 && prev <= 5) previousRating = prev;
        }
      } catch {
        previousRating = null;
      }
      await set(reviewRef, {
        trainerUid: uid,
        userUid: currentUser.uid,
        userName,
        category,
        categoryKey,
        rating,
        comment: comment?.trim() || null,
        createdAt: now,
        updatedAt: now,
      });
      await runTransaction(statsRef, (current) => {
        const raw = (current && typeof current === 'object' ? current : {}) as Record<string, unknown>;
        let sumRatings = Number(raw.sumRatings ?? 0);
        let totalReviews = Number(raw.totalReviews ?? 0);
        if (!Number.isFinite(sumRatings) || sumRatings < 0) sumRatings = 0;
        if (!Number.isFinite(totalReviews) || totalReviews < 0) totalReviews = 0;
        if (previousRating != null) {
          sumRatings -= previousRating;
          if (sumRatings < 0) sumRatings = 0;
        } else {
          totalReviews += 1;
        }
        sumRatings += rating;
        const averageRating = totalReviews > 0 ? sumRatings / totalReviews : 0;
        return {
          sumRatings,
          totalReviews,
          averageRating,
          updatedAt: now,
        };
      });
    })
  );
}

export async function getMyCategoryReview(category: string): Promise<{ rating?: number; comment?: string; trainerRatings?: Record<string, number> } | null> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;
  const keys = categoryReviewKeyCandidates(category);
  const paths: string[] = [];
  for (const k of keys) {
    paths.push(`categoryReviews/${k}/${currentUser.uid}`);
    paths.push(`users/${currentUser.uid}/categoryReviews/${k}`);
  }
  for (const path of paths) {
    try {
      const snap = await get(ref(db, path));
      if (!snap.exists()) continue;
      const raw = snap.val() as Record<string, unknown>;
      const parsed = parseCategoryReviewValue(raw);
      // Ignore empty placeholder rows (e.g. rating null + no trainerRatings + empty comment).
      if (!isMeaningfulCategoryReview(parsed)) continue;
      return {
        rating: parsed.rating,
        comment: parsed.comment,
        trainerRatings: parsed.trainerRatings,
      };
    } catch (e) {
      if (!isPermissionDeniedError(e)) {
        console.error('getMyCategoryReview:', e);
      }
    }
  }
  try {
    const localKeys = localCategoryReviewKeyCandidates(currentUser.uid, category);
    for (const lk of localKeys) {
      const local = await AsyncStorage.getItem(lk);
      if (!local) continue;
      const parsedJson = JSON.parse(local) as Record<string, unknown>;
      const parsed = parseCategoryReviewValue(parsedJson);
      if (!isMeaningfulCategoryReview(parsed)) continue;
      return { rating: parsed.rating, comment: parsed.comment, trainerRatings: parsed.trainerRatings };
    }
    return null;
  } catch {
    return null;
  }
}

export async function submitCategoryReview(
  category: string,
  rating: number | null | undefined,
  comment: string | undefined,
  trainerIds: string[],
  trainerNames: string[],
  trainerRatings?: Record<string, number>
): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('User not authenticated');
  if (rating != null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
    throw new Error('Rating must be 1 to 5');
  }
  const key = toCategoryReviewKey(category);
  const normalizedTrainerRatings: Record<string, number> = {};
  for (const [uid, value] of Object.entries(trainerRatings ?? {})) {
    if (!uid?.trim()) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1 && n <= 5) normalizedTrainerRatings[uid.trim()] = n;
  }
  const hasAnyTrainerRating = Object.keys(normalizedTrainerRatings).length > 0;
  const hasOverall = rating != null;
  const hasComment = !!comment?.trim();
  if (!hasAnyTrainerRating && !hasOverall && !hasComment) {
    throw new Error('Please add at least one rating or comment.');
  }
  const now = Date.now();
  const payload = {
    category,
    rating: hasOverall ? rating : null,
    comment: comment?.trim() || null,
    trainerIds: trainerIds.filter(Boolean),
    trainerNames: trainerNames.filter(Boolean),
    trainerRatings: hasAnyTrainerRating ? normalizedTrainerRatings : null,
    createdAt: now,
    userName:
      currentUser.firstName && currentUser.lastName
        ? `${currentUser.firstName} ${currentUser.lastName}`
        : currentUser.username || 'User',
  };
  const paths = [
    `categoryReviews/${key}/${currentUser.uid}`,
    `users/${currentUser.uid}/categoryReviews/${key}`,
  ];
  for (const path of paths) {
    try {
      const reviewRef = ref(db, path);
      const existing = await get(reviewRef);
      if (existing.exists()) {
        const prevRaw = existing.val() as Record<string, unknown>;
        const prev = parseCategoryReviewValue(prevRaw);
        if (isMeaningfulCategoryReview(prev)) {
          throw new Error('You already reviewed this category.');
        }
        await set(reviewRef, payload);
      } else {
        await set(reviewRef, payload);
      }
      if (hasAnyTrainerRating) {
        try {
          await persistTrainerRatingsToDb({
            category,
            categoryKey: key,
            comment,
            currentUser,
            trainerRatings: normalizedTrainerRatings,
          });
        } catch (inner) {
          if (!isPermissionDeniedError(inner)) console.error('persistTrainerRatingsToDb:', inner);
        }
      }
      return;
    } catch (e) {
      if ((e as Error)?.message === 'You already reviewed this category.') throw e;
      if (!isPermissionDeniedError(e)) console.error('submitCategoryReview:', e);
    }
  }
  const localKeys = localCategoryReviewKeyCandidates(currentUser.uid, category);
  let localKey = localCategoryReviewKey(currentUser.uid, key);
  let localExistingRaw: string | null = null;
  for (const lk of localKeys) {
    const hit = await AsyncStorage.getItem(lk);
    if (hit) {
      localKey = lk;
      localExistingRaw = hit;
      break;
    }
  }
  if (localExistingRaw) {
    try {
      const prevRaw = JSON.parse(localExistingRaw) as Record<string, unknown>;
      const prev = parseCategoryReviewValue(prevRaw);
      if (isMeaningfulCategoryReview(prev)) {
        throw new Error('You already reviewed this category.');
      }
      await AsyncStorage.setItem(localKey, JSON.stringify(payload));
    } catch (e) {
      if ((e as Error)?.message === 'You already reviewed this category.') throw e;
    }
  } else {
    await AsyncStorage.setItem(localKey, JSON.stringify(payload));
  }
  if (hasAnyTrainerRating) {
    try {
      await persistTrainerRatingsToDb({
        category,
        categoryKey: key,
        comment,
        currentUser,
        trainerRatings: normalizedTrainerRatings,
      });
    } catch (inner) {
      if (!isPermissionDeniedError(inner)) console.error('persistTrainerRatingsToDb:', inner);
    }
  }
}

export async function queueCategoryReviewPrompt(prompt: PendingCategoryReviewPrompt): Promise<void> {
  await AsyncStorage.setItem(PENDING_CATEGORY_REVIEW_PROMPT_KEY, JSON.stringify(prompt));
}

export async function popCategoryReviewPrompt(): Promise<PendingCategoryReviewPrompt | null> {
  const raw = await AsyncStorage.getItem(PENDING_CATEGORY_REVIEW_PROMPT_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(PENDING_CATEGORY_REVIEW_PROMPT_KEY);
  try {
    const parsed = JSON.parse(raw) as PendingCategoryReviewPrompt;
    if (!parsed?.category || !Array.isArray(parsed.trainers)) return null;
    return {
      category: String(parsed.category),
      trainers: parsed.trainers
        .map((t) => ({ uid: String(t.uid ?? '').trim(), name: String(t.name ?? '').trim() || 'Trainer' }))
        .filter((t) => !!t.uid),
    };
  } catch {
    return null;
  }
}

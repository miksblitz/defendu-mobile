import { ref, get, set, update } from 'firebase/database';
import { db } from '../config/firebaseConfig';
import type { Module } from '../models/Module';
import type { ModuleReview } from '../models/ModuleReview';
import { SEED_TEST_MODULES } from '../seed/testModules';
import { getCurrentUser } from './authSession';
import { normalizeArray, normalizeWarmupExercises } from './normalize';

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

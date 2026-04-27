import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../config/firebaseConfig';
import { getCurrentUser } from './authSession';
import { normalizeWarmupExercises } from './normalize';

export interface ModuleItem {
  moduleId: string;
  moduleTitle?: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  videoDuration?: number;
  /** basic | intermediate | advanced – used to group modules in the app */
  difficultyLevel?: 'basic' | 'intermediate' | 'advanced';
  /** 1–5, aligns with ML `profile_module_fit` / admin module metadata. */
  intensityLevel?: number;
  physicalDemandTags?: string[];
  /** Optional warmup exercises saved on the module. */
  warmupExercises?: string[];
  /** Optional cooldown stretches saved on the module. */
  cooldownExercises?: string[];
  /** Optional explicit sort order from admin table (lower = earlier in list). */
  sortOrder?: number;
  /** Guide media URL shown in training overlay (modules/{id}/referenceGuideUrl). */
  referenceGuideUrl?: string;
  /** Reference / technique media URLs for in-session guide overlay (Firebase). */
  referencePoseVideoUrlSide1?: string;
  referencePoseVideoUrlSide2?: string;
  techniqueVideoUrl?: string;
  techniqueVideoUrl2?: string;
  introductionVideoUrl?: string;
  /** Pose training timer length (seconds). */
  trainingDurationSeconds?: number;
  /** Optional segment library marker used by category program assignment. */
  moduleSegment?: 'warmup' | 'cooldown' | string;
  createdAt?: Date;
  updatedAt?: Date;
  status?: string;
}

export type CategorySegmentProgramRow = {
  warmupModuleIds?: string[];
  cooldownModuleIds?: string[];
};

export type CategorySegmentProgramMap = Record<string, CategorySegmentProgramRow>;

export interface ModuleCategoryWithMeta {
  key: string;
  name: string;
  thumbnailUrl: string | null;
}

function processModulesList(data: Record<string, Record<string, unknown>>): ModuleItem[] {
  const modules: ModuleItem[] = [];
  for (const id in data) {
    const item = data[id];
    if (!item || item.status !== 'approved') continue;
    const {
      referencePoseSequences: _s,
      referencePoseSequence: _s2,
      introduction,
      techniqueVideoLink: _tvl,
      referencePoseSequenceUrl: _rpu,
      videoDuration: _vd,
      spaceRequirements: _sr,
      submittedAt: _sa,
      reviewedAt: _ra,
      reviewedBy: _rb,
      rejectionReason: _rr,
      certificationChecked: _cc,
      ...rest
    } = item;
    const desc = typeof rest.description === 'string' ? rest.description : '';
    const intensityRaw = item.intensityLevel;
    const intensityLevel =
      typeof intensityRaw === 'number' && Number.isFinite(intensityRaw)
        ? Math.max(1, Math.min(5, Math.round(intensityRaw)))
        : undefined;
    const tagsRaw = item.physicalDemandTags;
    const physicalDemandTags = Array.isArray(tagsRaw)
      ? tagsRaw.map((t) => String(t).trim()).filter(Boolean)
      : undefined;

    modules.push({
      moduleId: id,
      ...rest,
      intensityLevel,
      physicalDemandTags,
      warmupExercises: normalizeWarmupExercises(rest.warmupExercises),
      description: desc.length > 300 ? desc.slice(0, 300) + '…' : desc,
      createdAt: item.createdAt ? new Date(item.createdAt as number) : new Date(),
      updatedAt: item.updatedAt ? new Date(item.updatedAt as number) : new Date(),
    } as ModuleItem);
  }
  modules.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
  return modules;
}

/**
 * Fetches approved modules for the dashboard. Firebase returns full documents;
 * keep module docs slim (no inline referencePoseSequence/referencePoseSequences—
 * use referencePoseData/{moduleId} or referencePoseSequenceUrl) for faster load.
 */
export async function getApprovedModules(): Promise<ModuleItem[]> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    const modulesRef = ref(db, 'modules');
    const q = query(modulesRef, orderByChild('status'), equalTo('approved'));
    let snapshot;
    try {
      snapshot = await get(q);
    } catch (queryErr: unknown) {
      const msg = String((queryErr as Error)?.message ?? queryErr);
      if (!msg.includes('Index not defined') && !msg.includes('indexOn')) throw queryErr;
      snapshot = await get(modulesRef);
    }
    if (!snapshot.exists()) return [];
    const raw = snapshot.val() as Record<string, Record<string, unknown>>;
    let data = raw;
    if (Object.keys(raw).some((id) => raw[id]?.status !== 'approved')) {
      data = {};
      for (const id in raw) {
        if (raw[id]?.status === 'approved') data[id] = raw[id];
      }
    }
    return processModulesList(data);
  } catch (e) {
    console.error('getApprovedModules:', e);
    return [];
  }
}

export async function getCategorySegmentProgram(): Promise<CategorySegmentProgramMap> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return {};
    const snapshot = await get(ref(db, 'categorySegmentProgram'));
    if (!snapshot.exists()) return {};
    const raw = snapshot.val() as Record<string, unknown>;
    const out: CategorySegmentProgramMap = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!value || typeof value !== 'object') continue;
      const row = value as Record<string, unknown>;
      out[key] = {
        warmupModuleIds: Array.isArray(row.warmupModuleIds)
          ? row.warmupModuleIds.map((id) => String(id).trim()).filter(Boolean)
          : [],
        cooldownModuleIds: Array.isArray(row.cooldownModuleIds)
          ? row.cooldownModuleIds.map((id) => String(id).trim()).filter(Boolean)
          : [],
      };
    }
    return out;
  } catch (e) {
    console.error('getCategorySegmentProgram:', e);
    return {};
  }
}

function normalizeModuleCategoryKey(category: string): string {
  return String(category ?? '')
    .trim()
    .toLowerCase()
    .replace(/[#$.[\]\/]/g, '_');
}

function readRemoteUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export async function getModuleCategoriesWithMeta(): Promise<ModuleCategoryWithMeta[]> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    const categoriesSnapshot = await get(ref(db, 'moduleCategories'));
    let metaRaw: Record<string, unknown> = {};
    try {
      const metaSnapshot = await get(ref(db, 'moduleCategoryMeta'));
      if (metaSnapshot.exists()) {
        metaRaw = metaSnapshot.val() as Record<string, unknown>;
      }
    } catch (metaErr) {
      // Metadata is optional. If access is denied, still return category names from `moduleCategories`.
      const metaMsg = String((metaErr as Error)?.message ?? metaErr ?? '');
      if (!/permission denied/i.test(metaMsg)) {
        console.warn('getModuleCategoriesWithMeta: moduleCategoryMeta read failed:', metaErr);
      }
    }

    if (!categoriesSnapshot.exists()) return [];
    const categoriesRaw = categoriesSnapshot.val();

    const rawNames: string[] = [];
    if (Array.isArray(categoriesRaw)) {
      for (const entry of categoriesRaw) {
        const name = String(entry ?? '').trim();
        if (name) rawNames.push(name);
      }
    } else if (categoriesRaw && typeof categoriesRaw === 'object') {
      for (const value of Object.values(categoriesRaw as Record<string, unknown>)) {
        const name = String(value ?? '').trim();
        if (name) rawNames.push(name);
      }
    }

    const deduped = new Set<string>();
    const out: ModuleCategoryWithMeta[] = [];
    for (const name of rawNames) {
      const normalizedKey = normalizeModuleCategoryKey(name);
      if (!normalizedKey || deduped.has(normalizedKey)) continue;
      deduped.add(normalizedKey);

      const meta =
        metaRaw && typeof metaRaw === 'object' && metaRaw[normalizedKey] && typeof metaRaw[normalizedKey] === 'object'
          ? (metaRaw[normalizedKey] as Record<string, unknown>)
          : null;
      const thumbnailUrl =
        readRemoteUrl(meta?.thumbnailUrl) ??
        readRemoteUrl(meta?.thumbnailURL) ??
        readRemoteUrl(meta?.thumbnail) ??
        readRemoteUrl(meta?.imageUrl) ??
        readRemoteUrl(meta?.image) ??
        null;

      out.push({
        key: normalizedKey,
        name,
        thumbnailUrl,
      });
    }

    return out;
  } catch (e) {
    console.error('getModuleCategoriesWithMeta:', e);
    return [];
  }
}


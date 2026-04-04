import { ref, get, query, orderByChild, equalTo, limitToFirst } from 'firebase/database';
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
  createdAt?: Date;
  updatedAt?: Date;
  status?: string;
}

/** Max approved modules to fetch in one request. Lower = faster dashboard load (Firebase returns full docs). */
const APPROVED_MODULES_LIMIT = 40;

function processModulesList(data: Record<string, Record<string, unknown>>): ModuleItem[] {
  const modules: ModuleItem[] = [];
  for (const id in data) {
    const item = data[id];
    if (!item || item.status !== 'approved') continue;
    const {
      referencePoseSequences: _s,
      referencePoseSequence: _s2,
      introduction,
      introductionVideoUrl: _iv,
      techniqueVideoUrl: _tv,
      techniqueVideoUrl2: _tv2,
      techniqueVideoLink: _tvl,
      referencePoseSequenceUrl: _rpu,
      referencePoseVideoUrlSide1: _rv1,
      referencePoseVideoUrlSide2: _rv2,
      videoDuration: _vd,
      spaceRequirements: _sr,
      trainingDurationSeconds: _td,
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
    const q = query(
      modulesRef,
      orderByChild('status'),
      equalTo('approved'),
      limitToFirst(APPROVED_MODULES_LIMIT)
    );
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
      let count = 0;
      for (const id in raw) {
        if (raw[id]?.status === 'approved' && count < APPROVED_MODULES_LIMIT) {
          data[id] = raw[id];
          count++;
        }
      }
    }
    return processModulesList(data);
  } catch (e) {
    console.error('getApprovedModules:', e);
    return [];
  }
}

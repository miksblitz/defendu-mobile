/**
 * moduleCache
 * Per-module offline cache for the data ViewModuleScreen / pose practice need.
 * Stores two things in AsyncStorage:
 *   - The raw Firebase module doc (so we can re-run mapModuleFromRaw and get a real Module).
 *   - The processed reference pose payload ({ sequences, focus }) used by the pose comparator.
 *
 * Reads/writes never throw — caller can call them defensively without try/catch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_VERSION = 1;
const MODULE_DOC_PREFIX = `moduleCache:v${CACHE_VERSION}:doc:`;
const REF_POSE_PREFIX = `moduleCache:v${CACHE_VERSION}:refPose:`;

// Modules don't change often; 30 days is generous and avoids serving very stale content forever.
const MODULE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REF_POSE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEnvelope<T> {
  /** Cache schema version — bump to invalidate everything if shape changes. */
  v: number;
  /** ms timestamp written. */
  ts: number;
  data: T;
}

async function readEntry<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T> | null;
    if (!env || typeof env !== 'object' || env.v !== CACHE_VERSION) return null;
    if (typeof env.ts !== 'number' || Date.now() - env.ts > ttlMs) return null;
    return env.data ?? null;
  } catch {
    return null;
  }
}

async function writeEntry<T>(key: string, data: T): Promise<void> {
  try {
    const env: CacheEnvelope<T> = { v: CACHE_VERSION, ts: Date.now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(env));
  } catch {
    // Ignore quota / serialization issues — cache is best-effort.
  }
}

export type RawModuleDoc = Record<string, unknown>;
export interface CachedReferencePose {
  sequences: unknown[];
  focus: string;
}

export async function getCachedModuleRaw(moduleId: string): Promise<RawModuleDoc | null> {
  if (!moduleId) return null;
  return readEntry<RawModuleDoc>(MODULE_DOC_PREFIX + moduleId, MODULE_TTL_MS);
}

export async function setCachedModuleRaw(moduleId: string, raw: RawModuleDoc): Promise<void> {
  if (!moduleId || !raw) return;
  return writeEntry<RawModuleDoc>(MODULE_DOC_PREFIX + moduleId, raw);
}

export async function getCachedReferencePose(moduleId: string): Promise<CachedReferencePose | null> {
  if (!moduleId) return null;
  return readEntry<CachedReferencePose>(REF_POSE_PREFIX + moduleId, REF_POSE_TTL_MS);
}

export async function setCachedReferencePose(moduleId: string, data: CachedReferencePose): Promise<void> {
  if (!moduleId || !data) return;
  return writeEntry<CachedReferencePose>(REF_POSE_PREFIX + moduleId, data);
}

/** Drop one module's cached doc + reference pose (e.g. after delete / unpublish). */
export async function clearCachedModule(moduleId: string): Promise<void> {
  if (!moduleId) return;
  try {
    await AsyncStorage.multiRemove([MODULE_DOC_PREFIX + moduleId, REF_POSE_PREFIX + moduleId]);
  } catch {
    // ignore
  }
}

/** Drop the entire per-module cache (logout, debug button, schema migration, etc.). */
export async function clearAllModuleCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const targets = keys.filter((k) => k.startsWith(MODULE_DOC_PREFIX) || k.startsWith(REF_POSE_PREFIX));
    if (targets.length > 0) await AsyncStorage.multiRemove(targets);
  } catch {
    // ignore
  }
}

/**
 * Race a network promise against a timeout. Returns null on timeout.
 * Note: does not actually cancel the underlying network call (Firebase JS SDK
 * has no cancel); the result just gets ignored if it arrives late.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race<T | null>([
    promise.then((v) => {
      if (timer) clearTimeout(timer);
      return v;
    }),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]);
}

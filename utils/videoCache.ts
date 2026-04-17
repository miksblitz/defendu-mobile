/**
 * videoCache
 * Downloads remote videos once into the app's cache directory and returns a local
 * `file://` URI on subsequent calls, so playback starts instantly (no buffering).
 *
 * Uses the legacy `expo-file-system` API because it handles redirects (Cloudinary,
 * Firebase, etc.) more reliably than the new scoped-path API on Android.
 *
 * Usage:
 *   const uri = await getCachedVideoUri('https://...mp4'); // downloads if needed
 *   prefetchVideo('https://...mp4');                        // fire-and-forget warm-up
 */
import * as FileSystem from 'expo-file-system/legacy';

const CACHE_SUBDIR = 'cached-videos/';
const inflight = new Map<string, Promise<string>>();
let ensureDirPromise: Promise<string | null> | null = null;

/** djb2 hash to derive a short, safe filename from the URL. */
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) + hash + input.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

function extensionFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const dot = clean.lastIndexOf('.');
    if (dot >= 0 && dot > clean.length - 8) {
      const ext = clean.slice(dot + 1).toLowerCase();
      if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
    }
  } catch {}
  return 'mp4';
}

function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function ensureCacheDir(): Promise<string | null> {
  if (ensureDirPromise) return ensureDirPromise;
  ensureDirPromise = (async () => {
    const base = FileSystem.cacheDirectory;
    if (!base) return null;
    const dir = base + CACHE_SUBDIR;
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
      return dir;
    } catch (err) {
      console.warn('videoCache: failed to create cache dir', err);
      return null;
    }
  })();
  return ensureDirPromise;
}

/**
 * Returns a local `file://` URI for the given remote video URL, downloading
 * and caching it the first time. Falls back to the remote URL on any failure
 * so playback still works (just without the local cache).
 */
export async function getCachedVideoUri(url: string): Promise<string> {
  const trimmed = (url || '').trim();
  if (!trimmed || !isRemote(trimmed)) return trimmed;
  const existing = inflight.get(trimmed);
  if (existing) return existing;

  const work = (async () => {
    const dir = await ensureCacheDir();
    if (!dir) return trimmed;
    const filename = `${hashString(trimmed)}.${extensionFromUrl(trimmed)}`;
    const target = dir + filename;
    try {
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists && info.size && info.size > 0) return target;
      // Clean any 0-byte or partial file from a prior failed attempt.
      if (info.exists) {
        try {
          await FileSystem.deleteAsync(target, { idempotent: true });
        } catch {}
      }
      const result = await FileSystem.downloadAsync(trimmed, target);
      if (result.status < 200 || result.status >= 300) {
        try {
          await FileSystem.deleteAsync(target, { idempotent: true });
        } catch {}
        return trimmed;
      }
      return result.uri || target;
    } catch (err) {
      try {
        await FileSystem.deleteAsync(target, { idempotent: true });
      } catch {}
      console.warn('videoCache: download failed, falling back to stream', err);
      return trimmed;
    }
  })();

  inflight.set(trimmed, work);
  try {
    return await work;
  } finally {
    // Keep the promise in the map so repeat callers get the resolved URI without re-downloading.
  }
}

/** Fire-and-forget prefetch. Safe to call repeatedly for the same URL. */
export function prefetchVideo(url: string): void {
  if (!url) return;
  const trimmed = url.trim();
  if (!trimmed || !isRemote(trimmed)) return;
  getCachedVideoUri(trimmed).catch(() => {});
}

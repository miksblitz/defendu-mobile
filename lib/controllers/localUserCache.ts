/**
 * User-specific ephemeral data previously stored under global AsyncStorage keys.
 * Must be cleared on logout / register / login-as-different-user so a new account
 * never sees the previous account's dashboard, progress, message badges, or offline module blobs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAllModuleCache } from './moduleCache';

export const DASHBOARD_MODULES_CACHE_KEY = 'dashboard_modules_cache';
export const DASHBOARD_CATEGORIES_CACHE_KEY = 'dashboard_categories_cache';
export const DASHBOARD_SEGMENT_PROGRAM_CACHE_KEY = 'dashboard_segment_program_cache';
export const DASHBOARD_PROGRESS_CACHE_KEY = 'dashboard_progress_cache';

/** Legacy key (pre–per-user storage); still removed for one-time cleanup. */
export const LEGACY_MESSAGES_LAST_SEEN_KEY = 'messagesLastSeenByChat_v1';

export function messagesLastSeenStorageKey(uid: string): string {
  return `messagesLastSeenByChat_v1:${uid}`;
}

const PURCHASED_IDS_PREFIX = 'purchased_module_ids:v1:';
const PENDING_CATEGORY_REVIEW_KEY = 'pendingCategoryReviewPrompt';

/**
 * Wipes local caches that must not leak across Firebase accounts on this device.
 */
export async function clearUserEphemeralStorage(): Promise<void> {
  const staticKeys = [
    DASHBOARD_MODULES_CACHE_KEY,
    DASHBOARD_CATEGORIES_CACHE_KEY,
    DASHBOARD_SEGMENT_PROGRAM_CACHE_KEY,
    DASHBOARD_PROGRESS_CACHE_KEY,
    LEGACY_MESSAGES_LAST_SEEN_KEY,
    PENDING_CATEGORY_REVIEW_KEY,
  ];
  try {
    const all = await AsyncStorage.getAllKeys();
    const dynamic = (all as string[]).filter(
      (k) =>
        k.startsWith(`${LEGACY_MESSAGES_LAST_SEEN_KEY}:`) ||
        k.startsWith(PURCHASED_IDS_PREFIX)
    );
    await AsyncStorage.multiRemove([...staticKeys, ...dynamic]);
  } catch {
    try {
      await AsyncStorage.multiRemove(staticKeys);
    } catch {
      // ignore
    }
  }
  try {
    await clearAllModuleCache();
  } catch {
    // ignore
  }
}

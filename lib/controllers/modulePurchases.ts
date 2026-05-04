import { get, ref, runTransaction, set } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../config/firebaseConfig';
import { getCurrentUser, updateStoredUserCredits } from './authSession';
import { withTimeout } from './moduleCache';

/** @deprecated v1 flat array — migrated to v2 on read */
const purchasedIdsStorageKeyV1 = (uid: string) => `purchased_module_ids:v1:${uid}`;
const purchasedIdsStorageKeyV2 = (uid: string) => `purchased_modules_cache:v2:${uid}`;

interface PurchasedModulesDiskCache {
  ids: string[];
  /** Set when we have successfully read `purchasedModules` from RTDB at least once (ids may be empty). */
  syncedAt: number | null;
}

export interface ModulePurchaseInvoice {
  invoiceNo: string;
  referenceNo: string;
  purchaseType: 'single' | 'category';
  moduleId?: string;
  moduleTitle?: string;
  category: string;
  amountCredits: number;
  purchasedModuleIds: string[];
  createdAt: number;
}

export interface ModulePurchaseResult {
  success: boolean;
  newCredits: number;
  purchasedModuleIds: string[];
  invoice: ModulePurchaseInvoice;
}

export interface PurchasedModuleMeta {
  moduleId: string;
  category?: string;
  purchasedAt?: number;
  referenceNo?: string;
}

async function readPurchasedModulesDiskCache(uid: string): Promise<PurchasedModulesDiskCache> {
  try {
    const rawV2 = await AsyncStorage.getItem(purchasedIdsStorageKeyV2(uid));
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as PurchasedModulesDiskCache).ids) &&
        Object.prototype.hasOwnProperty.call(parsed, 'syncedAt')
      ) {
        const p = parsed as PurchasedModulesDiskCache;
        const ids = p.ids.map((id) => String(id ?? '').trim()).filter(Boolean);
        const syncedAt =
          p.syncedAt === null
            ? null
            : typeof p.syncedAt === 'number' && p.syncedAt > 0
              ? p.syncedAt
              : null;
        return { ids, syncedAt };
      }
    }

    const legacy = await AsyncStorage.getItem(purchasedIdsStorageKeyV1(uid));
    if (legacy) {
      const parsed = JSON.parse(legacy) as unknown;
      if (Array.isArray(parsed)) {
        const ids = parsed.map((id) => String(id ?? '').trim()).filter(Boolean);
        const migrated: PurchasedModulesDiskCache = { ids, syncedAt: Date.now() };
        await AsyncStorage.setItem(purchasedIdsStorageKeyV2(uid), JSON.stringify(migrated)).catch(() => {});
        await AsyncStorage.removeItem(purchasedIdsStorageKeyV1(uid)).catch(() => {});
        return migrated;
      }
    }
  } catch {
    // ignore
  }
  return { ids: [], syncedAt: null };
}

async function writePurchasedModulesDiskCache(uid: string, data: PurchasedModulesDiskCache): Promise<void> {
  try {
    await AsyncStorage.setItem(purchasedIdsStorageKeyV2(uid), JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Writes the full purchased-id list to device storage (marks as synced for offline use).
 * Call after a successful unlock so the dashboard / sessions match after refresh or offline.
 */
export async function persistPurchasedModuleIdsSnapshot(ids: string[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const list = Array.from(new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean)));
  await writePurchasedModulesDiskCache(user.uid, { ids: list, syncedAt: Date.now() });
}

/**
 * Purchased module IDs from RTDB, with AsyncStorage fallback when offline or slow.
 * After at least one successful server read we persist `syncedAt` so offline mode still reflects
 * which modules were unlocked the last time the account synced (including an empty purchase list).
 */
export async function getPurchasedModuleIds(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const uid = user.uid;
  const disk = await readPurchasedModulesDiskCache(uid);

  const fetchRemote = () =>
    get(ref(db, `users/${uid}/purchasedModules`))
      .then((snap) => {
        if (!snap.exists()) return [] as string[];
        return Object.keys(snap.val() as Record<string, unknown>);
      })
      .catch((): null => null);

  const persistFromRemote = async (ids: string[]) => {
    await writePurchasedModulesDiskCache(uid, { ids, syncedAt: Date.now() });
  };

  const refresh = async () => {
    const remote = await withTimeout(fetchRemote(), 4000);
    if (remote !== null) await persistFromRemote(remote);
  };

  if (disk.syncedAt != null) {
    void refresh();
    return disk.ids;
  }

  const remote = await withTimeout(fetchRemote(), 4000);
  if (remote !== null) {
    await persistFromRemote(remote);
    return remote;
  }
  return disk.ids;
}

export async function getPurchasedModulesMeta(): Promise<PurchasedModuleMeta[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const snap = await get(ref(db, `users/${user.uid}/purchasedModules`));
  if (!snap.exists()) return [];
  const raw = snap.val() as Record<string, PurchasedModuleMeta>;
  return Object.entries(raw).map(([moduleId, value]) => ({
    moduleId,
    category: value?.category,
    purchasedAt: value?.purchasedAt,
    referenceNo: value?.referenceNo,
  }));
}

export async function getUserCreditsBalance(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const creditsSnap = await get(ref(db, `users/${user.uid}/credits`));
  const numeric = Number(creditsSnap.val() ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function purchaseModulesWithCredits(input: {
  purchaseType: 'single' | 'category';
  category: string;
  moduleIdsToPurchase: string[];
  amountCredits: number;
  moduleId?: string;
  moduleTitle?: string;
}): Promise<ModulePurchaseResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be logged in.');
  if (!Number.isFinite(input.amountCredits) || input.amountCredits <= 0) {
    throw new Error('Invalid purchase amount.');
  }
  const uniqueModuleIds = Array.from(new Set(input.moduleIdsToPurchase.filter(Boolean)));
  if (uniqueModuleIds.length === 0) throw new Error('Nothing to purchase.');

  const purchasedRef = ref(db, `users/${user.uid}/purchasedModules`);
  const purchasedSnap = await get(purchasedRef);
  const purchasedRaw = (purchasedSnap.exists() ? purchasedSnap.val() : {}) as Record<string, unknown>;
  const remaining = uniqueModuleIds.filter((id) => !(id in purchasedRaw));
  if (remaining.length === 0) throw new Error('These modules are already unlocked.');

  const perModulePrice = 50;
  const expectedAmount = perModulePrice * remaining.length;
  // Always charge based on latest DB state to avoid stale UI totals.
  const amountToCharge = expectedAmount;

  const creditsRef = ref(db, `users/${user.uid}/credits`);
  const beforePurchaseCredits = await getUserCreditsBalance();
  if (beforePurchaseCredits < amountToCharge) {
    throw new Error(`Not enough credits. Required ${amountToCharge}, available ${beforePurchaseCredits}.`);
  }
  let newCredits = beforePurchaseCredits;
  try {
    const tx = await runTransaction(creditsRef, (current) => {
      const safeCurrent = Number(current ?? 0);
      if (!Number.isFinite(safeCurrent)) return;
      if (safeCurrent < amountToCharge) return;
      return safeCurrent - amountToCharge;
    });
    if (tx.committed) {
      newCredits = Number(tx.snapshot.val() ?? 0);
    } else {
      const latestCredits = await getUserCreditsBalance();
      if (latestCredits < amountToCharge) {
        throw new Error(`Not enough credits. Required ${amountToCharge}, available ${latestCredits}.`);
      }
      // Fallback write for client environments where transaction may abort unexpectedly.
      newCredits = latestCredits - amountToCharge;
      await set(creditsRef, newCredits);
    }
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
      throw new Error('Purchase blocked by database permissions. Please sign in again.');
    }
    throw e;
  }

  const now = Date.now();
  const referenceNo = `REF-${String(now).slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
  for (const moduleId of remaining) {
    await set(ref(db, `users/${user.uid}/purchasedModules/${moduleId}`), {
      moduleId,
      category: input.category,
      purchasedAt: now,
      pricePaidCredits: perModulePrice,
      purchaseType: input.purchaseType,
      referenceNo,
    });
  }

  const invoiceNo = `MOD-${String(now).slice(-7)}-${Math.floor(Math.random() * 900 + 100)}`;
  const mid = String(input.moduleId ?? '').trim();
  const mtitle = String(input.moduleTitle ?? '').trim();
  const invoice: ModulePurchaseInvoice = {
    invoiceNo,
    referenceNo,
    purchaseType: input.purchaseType,
    category: input.category,
    amountCredits: amountToCharge,
    purchasedModuleIds: remaining,
    createdAt: now,
    ...(mid ? { moduleId: mid } : {}),
    ...(mtitle ? { moduleTitle: mtitle } : {}),
  };

  // RTDB set() rejects undefined property values — omit optional fields instead.
  await set(ref(db, `users/${user.uid}/modulePurchaseInvoices/${invoiceNo}`), {
    invoiceNo,
    referenceNo,
    purchaseType: input.purchaseType,
    category: input.category,
    amountCredits: amountToCharge,
    purchasedModuleIds: remaining,
    createdAt: now,
    ...(mid ? { moduleId: mid } : {}),
    ...(mtitle ? { moduleTitle: mtitle } : {}),
  });
  await updateStoredUserCredits(newCredits);

  const disk = await readPurchasedModulesDiskCache(user.uid);
  const mergedIds = Array.from(new Set([...disk.ids, ...remaining]));
  await writePurchasedModulesDiskCache(user.uid, { ids: mergedIds, syncedAt: Date.now() });

  return {
    success: true,
    newCredits,
    purchasedModuleIds: remaining,
    invoice,
  };
}

import { get, ref, runTransaction, set } from 'firebase/database';
import { db } from '../config/firebaseConfig';
import { getCurrentUser, updateStoredUserCredits } from './authSession';

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

export async function getPurchasedModuleIds(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const snap = await get(ref(db, `users/${user.uid}/purchasedModules`));
  if (!snap.exists()) return [];
  const raw = snap.val() as Record<string, unknown>;
  return Object.keys(raw);
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
  if (input.amountCredits !== expectedAmount) {
    throw new Error('Purchase price changed. Please try again.');
  }

  const creditsRef = ref(db, `users/${user.uid}/credits`);
  const beforePurchaseCredits = await getUserCreditsBalance();
  if (beforePurchaseCredits < input.amountCredits) {
    throw new Error(`Not enough credits. Required ${input.amountCredits}, available ${beforePurchaseCredits}.`);
  }
  let newCredits = beforePurchaseCredits;
  try {
    const tx = await runTransaction(creditsRef, (current) => {
      const safeCurrent = Number(current ?? 0);
      if (!Number.isFinite(safeCurrent)) return;
      if (safeCurrent < input.amountCredits) return;
      return safeCurrent - input.amountCredits;
    });
    if (tx.committed) {
      newCredits = Number(tx.snapshot.val() ?? 0);
    } else {
      const latestCredits = await getUserCreditsBalance();
      if (latestCredits < input.amountCredits) {
        throw new Error(`Not enough credits. Required ${input.amountCredits}, available ${latestCredits}.`);
      }
      // Fallback write for client environments where transaction may abort unexpectedly.
      newCredits = latestCredits - input.amountCredits;
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
  const invoice: ModulePurchaseInvoice = {
    invoiceNo,
    referenceNo,
    purchaseType: input.purchaseType,
    moduleId: input.moduleId,
    moduleTitle: input.moduleTitle,
    category: input.category,
    amountCredits: input.amountCredits,
    purchasedModuleIds: remaining,
    createdAt: now,
  };

  await set(ref(db, `users/${user.uid}/modulePurchaseInvoices/${invoiceNo}`), invoice);
  await updateStoredUserCredits(newCredits);

  return {
    success: true,
    newCredits,
    purchasedModuleIds: remaining,
    invoice,
  };
}

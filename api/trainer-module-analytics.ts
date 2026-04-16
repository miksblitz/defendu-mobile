import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0];
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set');
  }
  const serviceAccount = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString('utf8'));
  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ||
    'https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app';
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    databaseURL,
  });
}

async function requireAuth(req: VercelRequest): Promise<string> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new Error('Missing Authorization token');
  const token = header.slice('Bearer '.length);
  const app = getAdminApp();
  const decoded = await app.auth().verifyIdToken(token);
  return decoded.uid;
}

type TrainerModuleAnalyticsRow = {
  moduleId: string;
  moduleTitle: string;
  category: string;
  thumbnailUrl?: string | null;
  status?: string | null;
  buyers: number;
  creditsGross: number;
  avgCreditsPerBuyer: number;
  lastPurchasedAt?: number | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const uid = await requireAuth(req);
    const app = getAdminApp();
    const db = app.database();

    const userSnap = await db.ref(`users/${uid}`).get();
    const userVal = (userSnap.exists() ? userSnap.val() : null) as null | {
      role?: string;
      trainerApproved?: boolean;
    };
    const isApprovedTrainer = userVal?.role === 'trainer' && userVal?.trainerApproved === true;
    if (!isApprovedTrainer) {
      return res.status(403).json({ error: 'Trainer access required' });
    }

    // 1) Load trainer modules (approved only)
    const modulesSnap = await db.ref('modules').get();
    const modulesRaw = (modulesSnap.exists() ? modulesSnap.val() : {}) as Record<string, any>;
    const trainerModules: Array<{
      moduleId: string;
      moduleTitle: string;
      category: string;
      thumbnailUrl?: string | null;
      status?: string | null;
    }> = [];

    for (const [moduleId, mod] of Object.entries(modulesRaw)) {
      if (!mod || typeof mod !== 'object') continue;
      if (String(mod.trainerId ?? '').trim() !== uid) continue;
      if (String(mod.status ?? '').trim() !== 'approved') continue;
      trainerModules.push({
        moduleId,
        moduleTitle: String(mod.moduleTitle ?? moduleId),
        category: String(mod.category ?? 'Other'),
        thumbnailUrl: mod.thumbnailUrl ? String(mod.thumbnailUrl) : null,
        status: mod.status ? String(mod.status) : null,
      });
    }

    const trainerModuleIdSet = new Set(trainerModules.map((m) => m.moduleId));
    const statsByModule = new Map<
      string,
      { buyers: number; creditsGross: number; lastPurchasedAt: number | null }
    >();
    for (const mid of trainerModuleIdSet) {
      statsByModule.set(mid, { buyers: 0, creditsGross: 0, lastPurchasedAt: null });
    }

    // 2) Aggregate buyers + credit gross by scanning purchases across all users.
    //    Note: This is server-side and authenticated; acceptable for current scale.
    const usersSnap = await db.ref('users').get();
    const usersRaw = (usersSnap.exists() ? usersSnap.val() : {}) as Record<
      string,
      { purchasedModules?: Record<string, { purchasedAt?: number; pricePaidCredits?: number }> }
    >;

    for (const userRow of Object.values(usersRaw)) {
      const purchased = userRow?.purchasedModules;
      if (!purchased || typeof purchased !== 'object') continue;
      for (const [moduleId, meta] of Object.entries(purchased)) {
        if (!trainerModuleIdSet.has(moduleId)) continue;
        const current = statsByModule.get(moduleId);
        if (!current) continue;
        current.buyers += 1;
        const credits = Number((meta as any)?.pricePaidCredits ?? 0);
        current.creditsGross += Number.isFinite(credits) ? credits : 0;
        const purchasedAt = Number((meta as any)?.purchasedAt ?? 0);
        if (Number.isFinite(purchasedAt) && purchasedAt > 0) {
          current.lastPurchasedAt = Math.max(current.lastPurchasedAt ?? 0, purchasedAt);
        }
      }
    }

    const rows: TrainerModuleAnalyticsRow[] = trainerModules
      .map((m) => {
        const s = statsByModule.get(m.moduleId) ?? { buyers: 0, creditsGross: 0, lastPurchasedAt: null };
        const avg = s.buyers > 0 ? s.creditsGross / s.buyers : 0;
        return {
          moduleId: m.moduleId,
          moduleTitle: m.moduleTitle,
          category: m.category,
          thumbnailUrl: m.thumbnailUrl ?? null,
          status: m.status ?? null,
          buyers: s.buyers,
          creditsGross: s.creditsGross,
          avgCreditsPerBuyer: Number.isFinite(avg) ? avg : 0,
          lastPurchasedAt: s.lastPurchasedAt,
        };
      })
      .sort((a, b) => b.creditsGross - a.creditsGross);

    const totals = rows.reduce(
      (acc, r) => {
        acc.modules += 1;
        acc.buyers += r.buyers;
        acc.creditsGross += r.creditsGross;
        return acc;
      },
      { modules: 0, buyers: 0, creditsGross: 0 }
    );

    return res.status(200).json({
      success: true,
      trainerUid: uid,
      totals,
      modules: rows,
      phpEarnings: {
        available: false,
        note: 'PHP earnings require server-side payout tracking (future update).',
        payoutSplit: { trainer: 0.7, platform: 0.3 },
      },
    });
  } catch (error) {
    console.error('[TrainerAnalytics] error:', error);
    const msg = (error as Error)?.message || 'Failed to load analytics';
    if (msg.includes('Authorization') || msg.includes('token')) return res.status(401).json({ error: msg });
    return res.status(500).json({ error: 'Failed to load analytics', detail: msg });
  }
}

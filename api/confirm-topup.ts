import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

function paymongoAuth(): string {
  return Buffer.from(`${process.env.PAYMONGO_SECRET_KEY || ''}:`).toString('base64');
}

function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0];
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set');
  }
  const serviceAccount = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString('utf8'));
  const databaseURL = process.env.FIREBASE_DATABASE_URL || 'https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.PAYMONGO_SECRET_KEY) {
      return res.status(500).json({ error: 'PAYMONGO_SECRET_KEY is not configured' });
    }
    const uid = await requireAuth(req);
    const { sourceId, creditsToAdd } = req.body || {};
    const creditsNum = Number(creditsToAdd);
    if (!sourceId || !Number.isFinite(creditsNum) || creditsNum <= 0) {
      return res.status(400).json({ error: 'sourceId and positive creditsToAdd are required' });
    }

    const app = getAdminApp();
    const db = app.database();
    const topupRef = db.ref(`topups/${sourceId}`);
    const existingTopupSnap = await topupRef.get();
    if (existingTopupSnap.exists()) {
      const existing = existingTopupSnap.val() as {
        uid?: string;
        creditsApplied?: number;
        paymentId?: string;
        invoiceNo?: string;
        amountPhp?: number;
        createdAt?: number;
      };
      if (existing.uid === uid) {
        const userCreditsSnap = await db.ref(`users/${uid}/credits`).get();
        const currentCredits = Number(userCreditsSnap.val() ?? 0);
        return res.status(200).json({
          success: true,
          alreadyProcessed: true,
          sourceId,
          paymentId: existing.paymentId,
          newCredits: currentCredits,
          invoice: {
            invoiceNo: existing.invoiceNo || `INV-${sourceId.slice(-8).toUpperCase()}`,
            sourceId,
            amountPhp: Number(existing.amountPhp ?? 0),
            creditsAdded: Number(existing.creditsApplied ?? 0),
            createdAt: Number(existing.createdAt ?? Date.now()),
          },
        });
      }
      return res.status(403).json({ error: 'This payment source belongs to another user.' });
    }

    const sourceResp = await fetch(`https://api.paymongo.com/v1/sources/${sourceId}`, {
      headers: { Authorization: `Basic ${paymongoAuth()}`, 'Content-Type': 'application/json' },
    });
    const sourcePayload = await sourceResp.json().catch(() => ({}));
    if (!sourceResp.ok) {
      return res.status(502).json({ error: 'Failed to fetch source from PayMongo', detail: sourcePayload });
    }
    const source = (sourcePayload as any).data;
    const sourceStatus = source?.attributes?.status;
    if (sourceStatus !== 'chargeable' && sourceStatus !== 'paid') {
      return res.status(409).json({ error: `Payment not completed yet. Current source status: ${sourceStatus}` });
    }

    let paymentId: string | undefined;
    if (sourceStatus === 'chargeable') {
      const paymentResp = await fetch('https://api.paymongo.com/v1/payments', {
        method: 'POST',
        headers: { Authorization: `Basic ${paymongoAuth()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: source?.attributes?.amount,
              currency: 'PHP',
              description: source?.attributes?.description || 'Defendu Credits Top Up',
              source: { id: sourceId, type: 'source' },
            },
          },
        }),
      });
      const paymentPayload = await paymentResp.json().catch(() => ({}));
      if (!paymentResp.ok) {
        return res.status(502).json({ error: 'Failed to capture payment', detail: paymentPayload });
      }
      paymentId = (paymentPayload as any)?.data?.id;
    }

    const creditsRef = db.ref(`users/${uid}/credits`);
    const tx = await creditsRef.transaction((current) => {
      const safeCurrent = Number(current ?? 0);
      return safeCurrent + creditsNum;
    });
    if (!tx.committed) {
      return res.status(500).json({ error: 'Failed to update credits balance' });
    }
    const newCredits = Number(tx.snapshot.val() ?? 0);
    const amountPhp = Number(source?.attributes?.amount ?? 0) / 100;
    const createdAt = Date.now();
    const invoiceNo = `INV-${sourceId.slice(-8).toUpperCase()}-${String(createdAt).slice(-5)}`;

    await topupRef.set({
      uid,
      sourceId,
      creditsApplied: creditsNum,
      amountPhp,
      invoiceNo,
      paymentId: paymentId || null,
      createdAt,
    });

    return res.status(200).json({
      success: true,
      sourceId,
      paymentId,
      newCredits,
      invoice: {
        invoiceNo,
        sourceId,
        amountPhp,
        creditsAdded: creditsNum,
        createdAt,
      },
    });
  } catch (error) {
    console.error('[PayMongo] confirm-topup error:', error);
    const msg = (error as Error)?.message || 'Failed to confirm top up';
    if (msg.includes('Authorization')) return res.status(401).json({ error: msg });
    return res.status(500).json({ error: 'Failed to confirm top up', detail: msg });
  }
}

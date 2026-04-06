import type { VercelRequest, VercelResponse } from '@vercel/node';

const SERVER_BASE_URL =
  process.env.SERVER_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://defendu-mobile.vercel.app');

function paymongoAuth(): string {
  return Buffer.from(`${process.env.PAYMONGO_SECRET_KEY || ''}:`).toString('base64');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { amount, description } = req.body || {};
    if (!amount || !description) {
      return res.status(400).json({ error: 'amount and description are required' });
    }
    if (!process.env.PAYMONGO_SECRET_KEY) {
      return res.status(500).json({ error: 'PAYMONGO_SECRET_KEY is not configured' });
    }

    const amountCentavos = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCentavos) || amountCentavos <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const response = await fetch('https://api.paymongo.com/v1/sources', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${paymongoAuth()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountCentavos,
            currency: 'PHP',
            type: 'gcash',
            description,
            redirect: {
              success: `${SERVER_BASE_URL}/api/payment-success`,
              failed: `${SERVER_BASE_URL}/api/payment-failed`,
            },
          },
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail =
        (payload as { errors?: { detail?: string; code?: string }[] })?.errors?.[0]?.detail ||
        (payload as { errors?: { detail?: string; code?: string }[] })?.errors?.[0]?.code ||
        'Failed to create GCash payment source';
      return res.status(502).json({
        error: 'Failed to create GCash payment source',
        detail,
        status: response.status,
      });
    }

    const source = (payload as any).data;
    return res.status(200).json({
      checkoutUrl: source?.attributes?.redirect?.checkout_url,
      sourceId: source?.id,
    });
  } catch (error) {
    console.error('[PayMongo] create-gcash error:', error);
    return res.status(500).json({
      error: 'Failed to create GCash payment source',
      detail: (error as Error)?.message ?? 'Unknown error',
    });
  }
}

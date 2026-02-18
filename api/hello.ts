// Test: GET /api/hello - if this returns 200, the api folder is deployed
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, message: 'API is working' });
}

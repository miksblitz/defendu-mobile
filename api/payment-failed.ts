import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Payment Failed</title></head><body style="font-family:sans-serif;background:#fff5f5;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="background:#fff;padding:24px;border-radius:14px;max-width:360px;text-align:center">
<h2 style="color:#dc2626;margin-top:0">Payment Failed</h2>
<p style="color:#374151">Please close this page and try again in Defendu.</p>
</div></body></html>`);
}

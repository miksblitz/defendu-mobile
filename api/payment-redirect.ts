import type { VercelRequest, VercelResponse } from '@vercel/node';

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return c;
    }
  });
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const statusRaw = typeof req.query?.status === 'string' ? req.query.status : '';
  const status = statusRaw.toLowerCase() === 'success' ? 'success' : 'failed';

  const title = status === 'success' ? 'Payment Successful' : 'Payment Failed';
  const accent = status === 'success' ? '#16a34a' : '#dc2626';
  const bg = status === 'success' ? '#f0fdf4' : '#fff5f5';
  const bodyText =
    status === 'success'
      ? 'You can close this page and return to Defendu.'
      : 'Please close this page and try again in Defendu.';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title></head><body style="font-family:sans-serif;background:${bg};display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="background:#fff;padding:24px;border-radius:14px;max-width:360px;text-align:center">
<h2 style="color:${accent};margin-top:0">${escapeHtml(title)}</h2>
<p style="color:#374151">${escapeHtml(bodyText)}</p>
</div></body></html>`);
}


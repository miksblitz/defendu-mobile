// api/reset-redirect.ts - Defendu Mobile
// When user taps the link in the email, this page opens and redirects to the app via deep link (defenduapp://resetpassword?token=...).
// On mobile the app opens and shows the "Enter new password" screen.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { token, expiresAt } = req.query;

  if (!token) {
    return res.status(400).send(`
      <!DOCTYPE html><html><head><title>Invalid Reset Link</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>Invalid Reset Link</h1>
        <p>This password reset link is invalid or missing required parameters.</p>
      </body></html>
    `);
  }

  if (expiresAt) {
    const expiryTime = parseInt(expiresAt as string, 10);
    if (Date.now() > expiryTime) {
      return res.status(400).send(`
        <!DOCTYPE html><html><head><title>Link Expired</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Link Expired</h1>
          <p>This password reset link has expired. Please request a new one from the Defendu app.</p>
        </body></html>
      `);
    }
  }

  const qs = expiresAt ? `&expiresAt=${expiresAt}` : '';
  const deepLink = `defenduapp://resetpassword?token=${encodeURIComponent(token as string)}${qs}`;
  const apiBaseUrl = process.env.API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://defendu-mobile.vercel.app');
  const baseUrl = apiBaseUrl.replace(/\/api\/?$/, '');
  const webAppUrl = process.env.WEB_APP_URL || baseUrl;
  const webAppLink = `${webAppUrl}?resetpassword=1&token=${token}${qs}`;

  // Android: intent URL helps the OS open the app (set ANDROID_PACKAGE_ID in Vercel to your app's package, e.g. com.defendu.mobile)
  const androidPackage = process.env.ANDROID_PACKAGE_ID || '';
  const intentPath = `resetpassword?token=${encodeURIComponent(token as string)}${qs}`;
  const androidIntent = androidPackage
    ? `intent://${intentPath}#Intent;scheme=defenduapp;package=${androidPackage};end`
    : '';

  const escapedDeepLink = deepLink.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const escapedWebLink = webAppLink.replace(/'/g, "\\'");
  const escapedAndroidIntent = androidIntent.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Open Defendu App</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 24px; background: linear-gradient(135deg, #041527 0%, #000C17 100%); color: white; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; margin: 0; }
          .container { background: white; color: #333; padding: 32px 24px; border-radius: 20px; max-width: 420px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
          h1 { color: #000C17; margin: 0 0 8px; font-size: 24px; }
          .sub { color: #666; font-size: 15px; margin-bottom: 24px; line-height: 1.4; }
          .button { background-color: #00AABB; color: white !important; padding: 16px 32px; text-decoration: none; border-radius: 28px; display: inline-block; margin: 8px 0; font-weight: bold; font-size: 17px; cursor: pointer; border: none; width: 100%; max-width: 280px; }
          .button:active { opacity: 0.9; }
          .hint { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 13px; color: #666; line-height: 1.5; }
          .hint strong { color: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Defendu</h1>
          <p class="sub">Tap the button below to open the app and set your new password.</p>
          <a href="${deepLink.replace(/"/g, '&quot;')}" class="button" id="openApp">Open Defendu App</a>
          <p class="hint"><strong>Stuck here?</strong> If you're in Gmail or another in-app browser, tap the menu (⋮) and choose &quot;Open in Chrome&quot; or &quot;Open in Safari&quot;, then tap the button again. Make sure the Defendu app is installed.</p>
        </div>
        <script>
          (function() {
            var ua = navigator.userAgent || '';
            var isAndroid = /android/i.test(ua);
            var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
            var deepLink = "${escapedDeepLink}";
            var androidIntent = ${androidPackage ? `"${escapedAndroidIntent}"` : 'null'};
            var webLink = '${escapedWebLink}';
            var link = document.getElementById('openApp');
            if (link) link.setAttribute('href', (isAndroid && androidIntent) ? androidIntent : deepLink);
            if (isIOS || isAndroid) {
              try { window.location.href = (isAndroid && androidIntent) ? androidIntent : deepLink; } catch (e) {}
            } else {
              window.location.replace(webLink);
            }
          })();
        </script>
      </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}

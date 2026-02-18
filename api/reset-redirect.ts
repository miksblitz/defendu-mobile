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

  const deepLink = `defenduapp://resetpassword?token=${token}${expiresAt ? `&expiresAt=${expiresAt}` : ''}`;
  const apiBaseUrl = process.env.API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://defendu-mobile.vercel.app');
  const baseUrl = apiBaseUrl.replace(/\/api\/?$/, '');
  const webAppUrl = process.env.WEB_APP_URL || baseUrl;
  const webAppLink = `${webAppUrl}?resetpassword=1&token=${token}${expiresAt ? `&expiresAt=${expiresAt}` : ''}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Opening Defendu...</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <script>
          (function() {
            var deepLink = "${deepLink.replace(/"/g, '&quot;')}";
            var webLink = '${webAppLink.replace(/'/g, "\\'")}';
            var ua = navigator.userAgent || '';
            var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
            var isAndroid = /android/i.test(ua);
            var isMobile = isIOS || isAndroid;
            if (isMobile) {
              window.location.href = deepLink;
              setTimeout(function() {
                var el = document.getElementById('instructions');
                if (el) el.style.display = 'block';
              }, 2500);
            } else {
              window.location.replace(webLink);
            }
            document.addEventListener('DOMContentLoaded', function() {
              var btn = document.querySelector('.button');
              if (btn) btn.addEventListener('click', function(e) {
                e.preventDefault();
                if (isMobile) window.location.href = deepLink;
                else window.location.href = webLink;
              });
            });
          })();
        </script>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: linear-gradient(135deg, #041527 0%, #000C17 100%); color: white; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; margin: 0; }
          .container { background: white; color: #333; padding: 40px; border-radius: 20px; max-width: 500px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
          h1 { color: #000C17; margin-bottom: 20px; }
          .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #000C17; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .button { background-color: #000C17; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; display: inline-block; margin-top: 20px; font-weight: bold; cursor: pointer; }
          #instructions { display: none; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 14px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Defendu</h1>
          <p>Opening the app...</p>
          <div class="spinner"></div>
          <p style="margin-top: 20px;">If the app doesn't open, tap the button below:</p>
          <a href="${deepLink}" class="button">Open in Defendu App</a>
          <div id="instructions">
            <p><strong>App didn't open?</strong></p>
            <p>Make sure the Defendu app is installed, then tap the button above again.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}

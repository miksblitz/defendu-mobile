// api/password-reset.ts - Defendu Mobile (Vercel Serverless)
// Replicated from web version. Handles password reset + Mailjet email.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

let adminApp: admin.app.App | null = null;

function getAdminApp(): admin.app.App {
  if (!adminApp) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
    if (!serviceAccountKey) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 environment variable is not set');
    const serviceAccount = JSON.parse(Buffer.from(serviceAccountKey, 'base64').toString('utf8'));
    const databaseURL = process.env.FIREBASE_DATABASE_URL || 'https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app';
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      databaseURL,
    });
  }
  return adminApp;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email is required' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (email.toLowerCase() === 'admin@defendu.com') {
      return res.status(403).json({ error: 'This email is not available for password reset. Please contact support.', code: 'ADMIN_EMAIL_BLOCKED' });
    }

    const adminApp = getAdminApp();
    const auth = adminApp.auth();
    let userRecord: admin.auth.UserRecord | null = null;
    try {
      userRecord = await auth.getUserByEmail(email);
      if (!userRecord || !userRecord.uid) {
        return res.status(404).json({ error: 'No account found with this email address. Please check your email or create an account.', code: 'USER_NOT_FOUND' });
      }
    } catch {
      return res.status(404).json({ error: 'No account found with this email address. Please check your email or create an account.', code: 'USER_NOT_FOUND' });
    }

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + 5 * 60 * 1000;
    const db = adminApp.database();
    await db.ref(`passwordResetTokens/${token}`).set({
      email,
      userId: userRecord.uid,
      createdAt: Date.now(),
      expiresAt: tokenExpiry,
      used: false,
    });

    // Email link: use this deployment's URL so clicking opens app via reset-redirect -> deep link
    const apiBaseUrl = process.env.API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://defendu-mobile.vercel.app');
    const redirectUrl = `${apiBaseUrl}/api/reset-redirect?token=${token}&expiresAt=${tokenExpiry}`;

    const mailjetApiKey = process.env.MAILJET_API_KEY;
    const mailjetApiSecret = process.env.MAILJET_API_SECRET;
    const mailjetFromEmail = process.env.MAILJET_FROM_EMAIL || 'noreply@defendu.com';
    const mailjetFromName = process.env.MAILJET_FROM_NAME || 'Defendu';

    if (!mailjetApiKey || !mailjetApiSecret) {
      console.error('[password-reset] MAILJET_API_KEY or MAILJET_API_SECRET is not set in Vercel environment.');
      return res.status(503).json({
        error: 'Password reset email is temporarily unavailable.',
        message: 'Email service is not configured. Please contact support.',
        code: 'EMAIL_SERVICE_NOT_CONFIGURED',
      });
    }

    const mailjetApiUrl = 'https://api.mailjet.com/v3.1/send';
    const emailData = {
      Messages: [{
        From: { Email: mailjetFromEmail, Name: mailjetFromName },
        To: [{ Email: email }],
        Subject: 'Reset Your Password - Defendu',
        TextPart: `You requested a password reset. Click the link below (expires in 5 minutes):\n\n${redirectUrl}\n\nIf you didn't request this, please ignore this email.`,
        HTMLPart: `
          <!DOCTYPE html><html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #041527; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;"><h1 style="color: #00AABB; margin: 0;">Defendu</h1></div>
            <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #041527;">Password Reset Request</h2>
              <p>Tap the button below to open the Defendu app and set a new password. This link expires in <strong>5 minutes</strong>.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${redirectUrl}" style="background-color: #000C17; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">Reset Password</a>
              </div>
              <p style="font-size: 12px; color: #666;">If you didn't request a password reset, please ignore this email.</p>
            </div>
          </body></html>`,
      }],
    };
    // Diagnostic logging (no secrets). Check Vercel → Deployments → Functions → password-reset → Logs.
    const toDomain = email.replace(/^.*@/, '@');
    console.log('[password-reset] User found, sending via Mailjet. From:', mailjetFromEmail, 'To:***' + toDomain);

    const authHeader = Buffer.from(`${mailjetApiKey}:${mailjetApiSecret}`).toString('base64');
    const mailjetResponse = await fetch(mailjetApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${authHeader}` },
      body: JSON.stringify(emailData),
    });

    const mailjetBody = await mailjetResponse.json().catch(() => ({}));
    console.log('[password-reset] Mailjet response:', mailjetResponse.status, JSON.stringify(mailjetBody));

    if (!mailjetResponse.ok) {
      const mailjetMsg = (mailjetBody as { ErrorMessage?: string }).ErrorMessage || (mailjetBody as { message?: string }).message || `HTTP ${mailjetResponse.status}`;
      console.error('[password-reset] Mailjet send failed:', mailjetResponse.status, JSON.stringify(mailjetBody));
      return res.status(500).json({
        error: 'Could not send password reset email.',
        message: 'Please check your email address and try again, or contact support if the problem continues.',
        code: 'EMAIL_SEND_FAILED',
      });
    }

    return res.status(200).json({ success: true, message: 'Password reset email sent successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Password reset error:', err?.message, err);
    return res.status(500).json({
      error: 'Failed to process password reset request',
      message: err?.message || 'Please try again later or contact support.',
    });
  }
}

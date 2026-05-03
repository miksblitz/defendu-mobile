// api/forgot-password-send-otp.ts
// Sends a 6-digit OTP code to the user's email for password reset.
// Mirrors api/register-send-otp.ts but only allows existing users.

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

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function otpKeyForEmail(email: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  setCors(res);

  try {
    const { email } = req.body ?? {};
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email is required' });
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) return res.status(400).json({ error: 'Invalid email format' });
    if (normalizedEmail === 'admin@defendu.com') {
      return res.status(403).json({ error: 'This email is not available for password reset. Please contact support.', code: 'ADMIN_EMAIL_BLOCKED' });
    }

    const app = getAdminApp();
    try {
      await app.auth().getUserByEmail(normalizedEmail);
    } catch {
      return res.status(404).json({
        error: 'No account found with this email address. Please check your email or create an account.',
        code: 'USER_NOT_FOUND',
      });
    }

    const crypto = require('crypto');
    const code = String(crypto.randomInt(100000, 1000000));
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000;
    const key = otpKeyForEmail(normalizedEmail);
    await app.database().ref(`passwordResetOtps/${key}`).set({
      email: normalizedEmail,
      code,
      createdAt: now,
      expiresAt,
      used: false,
      attempts: 0,
      lockedUntil: 0,
    });

    const mailjetApiKey = process.env.MAILJET_API_KEY;
    const mailjetApiSecret = process.env.MAILJET_API_SECRET;
    const mailjetFromEmail = process.env.MAILJET_FROM_EMAIL || 'noreply@defendu.com';
    const mailjetFromName = process.env.MAILJET_FROM_NAME || 'Defendu';
    if (!mailjetApiKey || !mailjetApiSecret) {
      console.error('[forgot-password-send-otp] MAILJET keys not configured.');
      return res.status(503).json({ error: 'Email service is not configured.', code: 'EMAIL_SERVICE_NOT_CONFIGURED' });
    }

    const emailData = {
      Messages: [{
        From: { Email: mailjetFromEmail, Name: mailjetFromName },
        To: [{ Email: normalizedEmail }],
        Subject: 'Your Defendu password reset code',
        TextPart: `Your Defendu password reset code is: ${code}. This code expires in 10 minutes. If you did not request this, you can ignore this email.`,
        HTMLPart: `
          <!DOCTYPE html><html><body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #041527; padding: 24px; text-align: center; border-radius: 10px 10px 0 0;"><h1 style="color: #00AABB; margin: 0;">Defendu</h1></div>
            <div style="background-color: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #041527;">Reset your password</h2>
              <p>Use this code in the Defendu app to verify your identity and set a new password:</p>
              <p style="font-size: 28px; letter-spacing: 6px; font-weight: 700; color: #041527; text-align: center; margin: 20px 0;">${code}</p>
              <p style="font-size: 12px; color: #666;">This code expires in 10 minutes. If you did not request a password reset, you can ignore this email.</p>
            </div>
          </body></html>`,
      }],
    };

    const authHeader = Buffer.from(`${mailjetApiKey}:${mailjetApiSecret}`).toString('base64');
    const mailjetResponse = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${authHeader}` },
      body: JSON.stringify(emailData),
    });
    if (!mailjetResponse.ok) {
      const mailjetBody = await mailjetResponse.json().catch(() => ({}));
      console.error('[forgot-password-send-otp] Mailjet send failed:', mailjetResponse.status, JSON.stringify(mailjetBody));
      return res.status(500).json({ error: 'Failed to send password reset code. Please try again.', code: 'EMAIL_SEND_FAILED' });
    }

    return res.status(200).json({ success: true, message: 'OTP sent', expiresAt });
  } catch (error: any) {
    console.error('[forgot-password-send-otp] error:', error?.message ?? error);
    return res.status(500).json({ error: 'Failed to send OTP', message: error?.message || 'Unknown error' });
  }
}

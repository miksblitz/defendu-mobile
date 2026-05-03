// api/forgot-password-verify-otp.ts
// Verifies the 6-digit OTP code sent for password reset, then issues a short-lived
// reset token (same shape as the existing token-based flow). The mobile app then
// uses that token with /api/confirm-password-reset to set the new password.

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

const MAX_OTP_ATTEMPTS = 5;
const OTP_LOCK_MS = 5 * 60 * 1000;
const RESET_TOKEN_LIFETIME_MS = 10 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  setCors(res);

  try {
    const { email, code } = req.body ?? {};
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email is required' });
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'OTP code is required' });

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();
    if (!/^\d{6}$/.test(normalizedCode)) return res.status(400).json({ error: 'Invalid OTP format' });

    const app = getAdminApp();
    const key = otpKeyForEmail(normalizedEmail);
    const otpRef = app.database().ref(`passwordResetOtps/${key}`);
    const snapshot = await otpRef.once('value');
    const data = snapshot.val() as {
      email?: string;
      code?: string;
      expiresAt?: number;
      used?: boolean;
      attempts?: number;
      lockedUntil?: number;
    } | null;
    if (!data) return res.status(400).json({ error: 'OTP not found. Please request a new code.' });
    if (data.used) return res.status(400).json({ error: 'OTP already used. Please request a new code.' });
    if (typeof data.lockedUntil === 'number' && data.lockedUntil > Date.now()) {
      const remainingSec = Math.ceil((data.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({
        error: `Too many wrong attempts. Try again in ${remainingSec} seconds.`,
        lockedUntil: data.lockedUntil,
      });
    }
    if (!data.expiresAt || Date.now() > data.expiresAt) {
      await otpRef.remove();
      return res.status(400).json({ error: 'OTP expired. Please request a new code.' });
    }
    if ((data.email ?? '').toLowerCase() !== normalizedEmail) return res.status(400).json({ error: 'OTP email mismatch.' });
    if ((data.code ?? '') !== normalizedCode) {
      const attempts = (typeof data.attempts === 'number' ? data.attempts : 0) + 1;
      if (attempts >= MAX_OTP_ATTEMPTS) {
        const lockedUntil = Date.now() + OTP_LOCK_MS;
        await otpRef.update({ attempts, lockedUntil });
        return res.status(429).json({
          error: `Too many wrong attempts. Locked for ${Math.floor(OTP_LOCK_MS / 60000)} minutes.`,
          lockedUntil,
        });
      }
      await otpRef.update({ attempts });
      return res.status(400).json({ error: `Incorrect OTP code. ${MAX_OTP_ATTEMPTS - attempts} attempts left.` });
    }

    // OTP correct — look up the user and mint a reset token compatible with /api/confirm-password-reset.
    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await app.auth().getUserByEmail(normalizedEmail);
    } catch {
      return res.status(404).json({ error: 'No account found with this email address.', code: 'USER_NOT_FOUND' });
    }

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = Date.now() + RESET_TOKEN_LIFETIME_MS;
    await app.database().ref(`passwordResetTokens/${token}`).set({
      email: normalizedEmail,
      userId: userRecord.uid,
      createdAt: Date.now(),
      expiresAt: tokenExpiresAt,
      used: false,
      issuedVia: 'otp',
    });

    await otpRef.update({ used: true, verifiedAt: Date.now(), attempts: 0, lockedUntil: 0 });

    return res.status(200).json({
      success: true,
      message: 'OTP verified',
      token,
      expiresAt: tokenExpiresAt,
    });
  } catch (error: any) {
    console.error('[forgot-password-verify-otp] error:', error?.message ?? error);
    return res.status(500).json({ error: 'Failed to verify OTP', message: error?.message || 'Unknown error' });
  }
}

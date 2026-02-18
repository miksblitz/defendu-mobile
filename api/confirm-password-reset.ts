// api/confirm-password-reset.ts - Defendu Mobile (Vercel Serverless)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

let adminApp: admin.app.App | null = null;

function getAdminApp(): admin.app.App {
  if (!adminApp) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
    if (!serviceAccountKey) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set');
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

  try {
    const { token, newPassword } = req.body;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token is required' });
    if (!newPassword || typeof newPassword !== 'string') return res.status(400).json({ error: 'New password is required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const adminApp = getAdminApp();
    const db = adminApp.database();
    const auth = adminApp.auth();
    const tokenSnapshot = await db.ref(`passwordResetTokens/${token}`).once('value');
    const tokenData = tokenSnapshot.val();
    if (!tokenData) return res.status(400).json({ error: 'Invalid or expired token' });
    if (Date.now() > tokenData.expiresAt) {
      await db.ref(`passwordResetTokens/${token}`).remove();
      return res.status(400).json({ error: 'Token has expired. Please request a new password reset link.' });
    }
    if (tokenData.used) return res.status(400).json({ error: 'Token has already been used' });

    const userRecord = await auth.getUserByEmail(tokenData.email);
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    if (firebaseApiKey) {
      try {
        const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`;
        const verifyResponse = await fetch(verifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: tokenData.email, password: newPassword, returnSecureToken: true }),
        });
        const verifyResult = await verifyResponse.json();
        if (verifyResponse.ok && verifyResult.idToken) {
          return res.status(400).json({ error: 'New password must be different from your current password. Please choose a different password.' });
        }
      } catch { /* proceed */ }
    }

    await auth.updateUser(userRecord.uid, { password: newPassword });
    await db.ref(`passwordResetTokens/${token}`).update({ used: true });
    return res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error: any) {
    console.error('Confirm password reset error:', error);
    return res.status(500).json({ error: 'Failed to reset password', message: error.message });
  }
}

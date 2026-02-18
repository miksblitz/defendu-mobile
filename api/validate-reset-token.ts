// api/validate-reset-token.ts - Defendu Mobile (Vercel Serverless)

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
    const { token } = req.body;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token is required' });
    const db = getAdminApp().database();
    const tokenSnapshot = await db.ref(`passwordResetTokens/${token}`).once('value');
    const tokenData = tokenSnapshot.val();
    if (!tokenData) return res.status(400).json({ valid: false, error: 'Invalid or expired token' });
    if (tokenData.used) return res.status(400).json({ valid: false, error: 'This token has already been used' });
    const now = Date.now();
    if (now > tokenData.expiresAt) {
      await db.ref(`passwordResetTokens/${token}`).remove();
      return res.status(400).json({ valid: false, error: 'Token has expired. Please request a new password reset link.' });
    }
    return res.status(200).json({ valid: true, email: tokenData.email, expiresAt: tokenData.expiresAt, timeRemaining: tokenData.expiresAt - now });
  } catch (error: any) {
    console.error('Token validation error:', error);
    return res.status(500).json({ error: 'Failed to validate token', message: error.message });
  }
}

export interface GcashPaymentResult {
  checkoutUrl: string;
  sourceId: string;
}

export interface QrPaymentResult {
  qrCodeUrl: string;
  qrCodeDataUrl?: string;
  checkoutUrl?: string;
  sourceId: string;
}

export interface TopUpInvoice {
  invoiceNo: string;
  sourceId: string;
  amountPhp: number;
  creditsAdded: number;
  createdAt: number;
}

export interface ConfirmTopUpResult {
  success: boolean;
  newCredits: number;
  sourceId: string;
  paymentId?: string;
  alreadyProcessed?: boolean;
  invoice?: TopUpInvoice;
}

import { updateStoredUserCredits } from './authSession';

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return (
    process.env.EXPO_PUBLIC_PAYMENT_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    'https://defendu-mobile.vercel.app'
  );
}

async function postPaymentEndpoint<T>(paths: string[], body: Record<string, unknown>): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();
  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      }
      return data as T;
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError ?? new Error('Payment request failed');
}

export async function checkPaymentServerHealth(): Promise<boolean> {
  const apiBaseUrl = getApiBaseUrl();
  const healthPaths = ['/create-qr', '/api/create-qr'];
  for (const path of healthPaths) {
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Reachable route is enough here; 400 is expected with empty payload.
      if (res.status !== 404) return true;
    } catch {
      // try next path
    }
  }
  return false;
}

export async function createGcashPayment(amountPhp: number, description: string): Promise<GcashPaymentResult> {
  return postPaymentEndpoint<GcashPaymentResult>(
    ['/create-gcash', '/api/create-gcash'],
    { amount: amountPhp, description }
  );
}

export async function createQrPayment(amountPhp: number, description: string): Promise<QrPaymentResult> {
  return postPaymentEndpoint<QrPaymentResult>(
    ['/create-qr', '/api/create-qr'],
    { amount: amountPhp, description }
  );
}

export async function confirmTopUpPayment(sourceId: string, creditsToAdd: number): Promise<ConfirmTopUpResult> {
  const apiBaseUrl = getApiBaseUrl();
  const { auth } = await import('../config/firebaseConfig');
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('You must be logged in to confirm payment.');
  const idToken = await currentUser.getIdToken();

  const paths = ['/confirm-topup', '/api/confirm-topup'];
  let lastError: Error | null = null;
  for (const path of paths) {
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ sourceId, creditsToAdd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string; detail?: string }).detail || (data as { error?: string }).error || `Request failed (${res.status})`);
      }
      const result = data as ConfirmTopUpResult;
      if (result.success && Number.isFinite(result.newCredits)) {
        await updateStoredUserCredits(result.newCredits);
      }
      return result;
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error('Failed to confirm top up payment');
}

/** API base URL for password reset and related endpoints (defendu-mobile Vercel deployment). */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return process.env.EXPO_PUBLIC_API_BASE_URL || process.env.REACT_APP_API_BASE_URL || 'https://defendu-mobile.vercel.app';
}

export async function sendRegistrationOtp(email: string): Promise<string> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/register-send-otp`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const raw = await response.text();
  let result: any = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('OTP service is unavailable right now. Please contact support or deploy the latest backend API.');
    }
    if (response.status === 503) {
      throw new Error('Email service is not configured yet. Please contact support.');
    }
    const msg = (result as any).error || (result as any).message || 'Failed to send OTP';
    throw new Error(msg);
  }
  return (result as any).message || 'OTP sent';
}

export async function verifyRegistrationOtp(email: string, code: string): Promise<string> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/register-verify-otp`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const raw = await response.text();
  let result: any = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('OTP verification service is unavailable. Please try again later.');
    }
    const msg = (result as any).error || (result as any).message || 'Failed to verify OTP';
    throw new Error(msg);
  }
  return (result as any).message || 'OTP verified';
}

export async function sendForgotPasswordOtp(email: string): Promise<{ message: string; expiresAt?: number }> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/forgot-password-send-otp`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const raw = await response.text();
  let result: any = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
  if (!response.ok) {
    if (response.status === 404 && (result?.code === 'USER_NOT_FOUND' || /no account/i.test(String(result?.error ?? '')))) {
      throw new Error('No account found with this email address.');
    }
    if (response.status === 404) {
      throw new Error('Password reset service is unavailable. Please try again later.');
    }
    if (response.status === 503) {
      throw new Error('Email service is not configured yet. Please contact support.');
    }
    const msg = (result as any).error || (result as any).message || 'Failed to send OTP';
    throw new Error(msg);
  }
  return { message: (result as any).message || 'OTP sent', expiresAt: (result as any).expiresAt };
}

export async function verifyForgotPasswordOtp(email: string, code: string): Promise<{ token: string; expiresAt: number }> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/forgot-password-verify-otp`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const raw = await response.text();
  let result: any = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('OTP verification service is unavailable. Please try again later.');
    }
    const msg = (result as any).error || (result as any).message || 'Failed to verify OTP';
    throw new Error(msg);
  }
  const token = (result as any).token;
  const expiresAt = (result as any).expiresAt;
  if (!token || typeof token !== 'string') {
    throw new Error('Verification succeeded but no reset token was returned. Please try again.');
  }
  return { token, expiresAt: typeof expiresAt === 'number' ? expiresAt : Date.now() + 5 * 60 * 1000 };
}

/** Validate reset token (e.g. when app opens via deep link). */
export async function validateResetToken(token: string): Promise<{ valid: true; email: string } | { valid: false; error: string }> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/validate-reset-token`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.valid === true) return { valid: true, email: data.email };
  return { valid: false, error: data.error || 'Invalid or expired link. Please request a new one.' };
}

/** Submit new password after token validation. */
export async function confirmPasswordReset(token: string, newPassword: string): Promise<string> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/confirm-password-reset`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to reset password');
  return data.message || 'Password reset successfully';
}

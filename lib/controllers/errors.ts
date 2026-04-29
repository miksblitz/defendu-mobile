/** Pull `auth/...` from Firebase's long error strings, e.g. `Firebase: Error (auth/user-not-found).` */
function normalizeFirebaseAuthCode(input: string): string {
  const trimmed = String(input).trim();
  const inParens = trimmed.match(/\((auth\/[a-z0-9-]+)\)/i);
  if (inParens) return inParens[1];
  if (trimmed.startsWith('auth/')) return trimmed;
  const inline = trimmed.match(/\b(auth\/[a-z0-9-]+)\b/i);
  return inline ? inline[1] : trimmed;
}

export function getErrorMessage(errorCode: string | undefined): string {
  if (!errorCode) return 'Could not complete this. Please try again.';

  const raw = String(errorCode).trim();
  const lower = raw.toLowerCase();

  // App / RTDB messages (no auth/ code)
  if (lower.includes('blocked')) {
    return 'This account has been blocked. Please contact support.';
  }
  if (lower.includes('user data not found')) {
    return 'Your account exists but your profile is missing. Please contact support.';
  }
  if (lower.includes('admin login is disabled')) {
    return 'Admin sign-in is not available in the app. Please use the web dashboard.';
  }

  const code = normalizeFirebaseAuthCode(raw);

  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/invalid-email':
      return 'That email address is not valid. Please check it and try again.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-not-found':
      return 'No account uses this email. Check the address or create an account.';
    case 'auth/wrong-password':
    case 'auth/invalid-password':
      return 'Wrong password. Try again or use Forgot password.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      // Firebase often uses this for both missing user and bad password — cannot tell which.
      return 'No account for this email, or the password is wrong.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Connection problem. Check your internet and try again.';
    case 'auth/internal-error':
      return 'Something went wrong on our side. Please try again in a moment.';
    case 'PERMISSION_DENIED':
    case 'permission-denied':
      return 'Something went wrong on our end. Please try again later.';
    default:
      break;
  }

  if (lower.includes('user-not-found')) {
    return 'No account uses this email. Check the address or create an account.';
  }
  if (lower.includes('wrong-password') || lower.includes('invalid-password')) {
    return 'Wrong password. Try again or use Forgot password.';
  }
  if (lower.includes('invalid-email')) {
    return 'That email address is not valid. Please check it and try again.';
  }
  if (lower.includes('invalid-credential') || lower.includes('invalid-login-credentials')) {
    return 'No account for this email, or the password is wrong.';
  }
  if (lower.includes('user not found') || lower.includes('no user record')) {
    return 'No account uses this email. Check the address or create an account.';
  }
  if (lower.includes('network') || lower.includes('connection')) {
    return 'Connection problem. Check your internet and try again.';
  }

  return 'Something went wrong. Please check your email and password and try again.';
}

/** Prefer Firebase `auth/*` code when present so login/register toasts match the real failure. */
export function formatAuthError(error: unknown): string {
  const err = error as { code?: string; message?: string };
  const authCode = typeof err.code === 'string' && err.code.startsWith('auth/') ? err.code : '';
  return getErrorMessage(authCode || err.message || undefined);
}

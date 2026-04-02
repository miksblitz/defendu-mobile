export function getErrorMessage(errorCode: string | undefined): string {
  if (!errorCode) return 'Login failed. Please try again.';
  const code = String(errorCode);
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-not-found':
      return 'No account found with this email. Please check your email or create an account.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Connection error. Please check your internet and try again.';
    case 'PERMISSION_DENIED':
    case 'permission-denied':
      return 'Something went wrong on our end. Please try again later.';
    default:
      break;
  }
  if (code.toLowerCase().includes('user not found') || code.toLowerCase().includes('user data not found')) return 'No account found with this email. Please check your email or create an account.';
  if (code.toLowerCase().includes('wrong password') || code.toLowerCase().includes('incorrect password')) return 'Incorrect password. Please try again.';
  if (code.toLowerCase().includes('invalid') && code.toLowerCase().includes('credential')) return 'Invalid email or password. Please try again.';
  if (code.toLowerCase().includes('network') || code.toLowerCase().includes('connection')) return 'Connection error. Please check your internet and try again.';
  return 'Invalid email or password. Please check your details and try again.';
}

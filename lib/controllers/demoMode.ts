/** No-op: demo mode was removed. Kept so cached bundles or indirect refs do not throw. */
export async function isDemoMode(): Promise<boolean> {
  return false;
}

/** No-op: demo mode was removed. */
export async function setDemoModeAndUser(): Promise<void> {}

/** No-op: demo mode was removed. */
export async function clearDemoMode(): Promise<void> {}

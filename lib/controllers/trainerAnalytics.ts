export type TrainerModuleAnalyticsRow = {
  moduleId: string;
  moduleTitle: string;
  category: string;
  thumbnailUrl?: string | null;
  status?: string | null;
  buyers: number;
  creditsGross: number;
  avgCreditsPerBuyer: number;
  lastPurchasedAt?: number | null;
};

export type TrainerModuleAnalyticsResponse = {
  success: true;
  trainerUid: string;
  totals: { modules: number; buyers: number; creditsGross: number };
  modules: TrainerModuleAnalyticsRow[];
  phpEarnings: {
    available: false;
    note: string;
    payoutSplit: { trainer: number; platform: number };
  };
};

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return (
    process.env.EXPO_PUBLIC_PAYMENT_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    'https://defendu-mobile.vercel.app'
  );
}

export async function getTrainerPublishedModuleAnalytics(): Promise<TrainerModuleAnalyticsResponse> {
  const apiBaseUrl = getApiBaseUrl();
  const { auth } = await import('../config/firebaseConfig');
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('You must be logged in.');
  const idToken = await currentUser.getIdToken();

  // Prefer the Vercel serverless convention first: /api/<route>
  const paths = ['/api/trainer-module-analytics', '/trainer-module-analytics'];
  const attemptedUrls: string[] = [];
  let lastError: Error | null = null;

  for (const path of paths) {
    attemptedUrls.push(`${apiBaseUrl}${path}`);
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string; detail?: string }).detail || (data as { error?: string }).error || `Request failed (${res.status})`);
      }
      return data as TrainerModuleAnalyticsResponse;
    } catch (e) {
      lastError = e as Error;
    }
  }

  const detail = attemptedUrls.length ? ` Tried: ${attemptedUrls.join(', ')}` : '';
  const baseHint =
    'Hint: set EXPO_PUBLIC_API_BASE_URL (or EXPO_PUBLIC_PAYMENT_API_BASE_URL) to your Vercel domain hosting these /api routes.';
  const msg = (lastError?.message || 'Failed to load trainer analytics') + detail;
  throw new Error(`${msg}\n${baseHint}`);
}


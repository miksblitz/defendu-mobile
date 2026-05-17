export type ModuleSessionStat = {
  moduleId: string;
  title: string;
  correctReps: number;
  badReps: number;
  durationMs: number;
  completed: boolean;
};

export type WorkoutSessionSummary = {
  category: string;
  outcome: 'completed' | 'quit';
  durationMs: number;
  modules: ModuleSessionStat[];
  totalCorrectReps: number;
  totalBadReps: number;
  personalBestMs: number | null;
  isNewPersonalBest: boolean;
};

export function normalizeCategoryKey(category: string): string {
  return String(category ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDurationCompact(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

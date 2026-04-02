export function normalizeArray(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => Number(a) - Number(b));
    if (keys.every((k) => !isNaN(Number(k)))) return keys.map((k) => (value as Record<string, string>)[k]);
  }
  return undefined;
}

function normalizeWarmupExerciseLabel(label: string): string {
  const t = label.trim();
  const low = t.toLowerCase();
  if ((low.includes('hip') && low.includes('circle')) || low.includes('hula')) return 'HIP CIRCLES';
  return t;
}

export function normalizeWarmupExercises(value: unknown): string[] {
  const arr = normalizeArray(value) ?? [];
  return arr.map(normalizeWarmupExerciseLabel);
}

export function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

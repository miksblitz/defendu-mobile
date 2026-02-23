/**
 * Parse repRange (e.g. "4-6 reps", "12 reps") to get required number of correct reps
 * for the pose-based "Try with pose" flow.
 */
export function getRequiredReps(repRange: string | undefined): number {
  if (!repRange?.trim()) return 5;
  const match = repRange.match(/(\d+)\s*-\s*(\d+)|(\d+)/);
  if (!match) return 5;
  const a = match[1] ? parseInt(match[1], 10) : null;
  const b = match[2] ? parseInt(match[2], 10) : null;
  const c = match[3] ? parseInt(match[3], 10) : null;
  if (a != null && b != null) return Math.max(a, b);
  if (c != null) return c;
  return 5;
}

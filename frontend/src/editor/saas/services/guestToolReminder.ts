/** Successful manual runs between dismissible signup reminders; this is not an execution limit. */
export const GUEST_SIGNUP_REMINDER_INTERVAL = 2;

const pendingRuns = new Map<string, number>();

/** Browser-local, best-effort cadence per guest. Storage failures never block processing. */
export function recordGuestToolRun(userId: string): boolean {
  const key = `stirling:guest-tool-reminder:${userId}`;
  let count = pendingRuns.get(key) ?? 0;
  try {
    const stored = localStorage.getItem(key);
    const parsed = stored === null ? 0 : Number(stored);
    count = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    // Keep the reminder working in this tab when browser storage is unavailable.
  }
  const next = (count + 1) % GUEST_SIGNUP_REMINDER_INTERVAL;
  pendingRuns.set(key, next);
  try {
    localStorage.setItem(key, String(next));
  } catch {
    // The in-memory count remains available without making tool success depend on storage.
  }
  return next === 0;
}

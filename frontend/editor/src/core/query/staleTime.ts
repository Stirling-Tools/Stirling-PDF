/**
 * staleTime for server capability and config lookups — values that only change
 * when an admin changes them, so they're worth holding for a whole session.
 *
 * Web builds talk to exactly one backend for the app's lifetime, so `Infinity`
 * is safe: the only thing that can invalidate these is an auth change, and that
 * is wired explicitly rather than left to a timer.
 *
 * Desktop shadows this file — see desktop/query/staleTime.ts for why.
 */
export const CONFIG_STALE_TIME = Infinity;

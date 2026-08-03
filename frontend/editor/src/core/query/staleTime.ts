/**
 * staleTime for server capability and config lookups. A web build talks to one
 * backend for its whole life and these only change when an admin changes them,
 * which already requires a restart to take effect.
 *
 * Only use this for values that are the same for every user — nothing
 * auth-scoped. There is no invalidation on login/logout yet.
 *
 * Desktop shadows this file; it cannot assume a single backend.
 */
export const CONFIG_STALE_TIME = Infinity;

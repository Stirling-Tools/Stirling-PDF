/**
 * staleTime for server config lookups. A web build talks to one backend for its
 * whole life, and changing these server-side already needs a restart.
 *
 * Only for values that are the same for every user — there is no invalidation
 * on login/logout. Desktop shadows this; it cannot assume a single backend.
 */
export const CONFIG_STALE_TIME = Infinity;

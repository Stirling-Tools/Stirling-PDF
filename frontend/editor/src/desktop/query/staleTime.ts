/**
 * Desktop override: config lookups expire, they don't live forever.
 *
 * On desktop the same relative path does not always reach the same backend.
 * operationRouter resolves it per request to the local bundled backend, a
 * self-hosted server or the SaaS backend, depending on connection mode and (for
 * tool endpoints) on local availability. A cached answer can therefore outlive
 * the backend that produced it, which cannot happen on web.
 *
 * The primary defence is the cache reset on mode change in
 * desktop/components/AppProviders.tsx. This finite ceiling is the backstop for
 * everything that changes the resolved backend without going through a mode
 * change — most importantly a self-hosted server coming back online, which
 * flips routing from the local fallback back to the server with no mode event.
 * Five minutes matches the TTLs endpointAvailabilityService and
 * saasAppConfigService already use for the same class of data.
 */
export const CONFIG_STALE_TIME = 5 * 60_000;

/**
 * Base path where the admin portal route-set mounts inside the editor app
 * (see adminRouteExtensions). Lives in core so any layer can reference the
 * mount point without importing portal code — build flavors that ship no
 * portal (core, desktop, prototypes) must never resolve @portal.
 */
export const PORTAL_BASENAME = "/processor";

/**
 * Router path for the portal's "Usage & Billing" view. Mirrors
 * `toPortalPath(VIEW_PATHS.usage)` but is expressed here in core so non-portal
 * layers (proprietary/desktop/cloud, which compile without an @portal mapping)
 * can deep-link to it. It's an absolute path under the app's single router, so
 * `navigate(PORTAL_USAGE_PATH)` resolves the same from the editor or from
 * within the portal (no double `/processor` prefix).
 */
export const PORTAL_USAGE_PATH = `${PORTAL_BASENAME}/usage`;

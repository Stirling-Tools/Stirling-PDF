/**
 * Base path where the admin portal route-set mounts inside the editor app
 * (see adminRouteExtensions). Lives in core so any layer can reference the
 * mount point without importing portal code — build flavors that ship no
 * portal (core, desktop, prototypes) must never resolve @portal.
 */
export const PORTAL_BASENAME = "/processor";

/**
 * Fragment identifying the recorded-failures section of the portal's Documents
 * view. Here for the same reason as the basename: whoever links to that section
 * and whoever renders it are in different layers, and neither should have to
 * import the other to agree on the anchor.
 */
export const PORTAL_FAILURES_ANCHOR = "failures";

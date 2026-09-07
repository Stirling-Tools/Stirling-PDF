/**
 * Base path where the admin portal route-set mounts inside the editor app
 * (see adminRouteExtensions). Lives in core so any layer can reference the
 * mount point without importing portal code — build flavors that ship no
 * portal (core, desktop, prototypes) must never resolve @portal.
 */
export const PORTAL_BASENAME = "/processor";

/**
 * The recorded-failures section of the portal's Documents view. Here because whoever links to it and
 * whoever renders it are in different layers.
 */
export const PORTAL_FAILURES_ANCHOR = "failures";

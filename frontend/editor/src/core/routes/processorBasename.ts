/**
 * Base path where the admin processor route-set mounts inside the editor app
 * (see adminRouteExtensions). Lives in core so any layer can reference the
 * mount point without importing processor code — build flavors that ship no
 * processor (core, desktop, prototypes) must never resolve @processor.
 */
export const PROCESSOR_BASENAME = "/processor";

/**
 * The recorded-failures section of the processor's Documents view. Here because whoever links to it and
 * whoever renders it are in different layers.
 */
export const PROCESSOR_FAILURES_ANCHOR = "failures";

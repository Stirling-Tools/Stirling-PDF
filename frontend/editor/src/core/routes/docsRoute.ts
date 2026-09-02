/** Where the documentation browser lives, for links and the quick-nav rail. */
export const DOCS_PATH = "/docs";

/**
 * Whether this build ships the bundled documentation manifest. Shadowed per
 * build: the manifest travels with the portal chunk, so builds without it
 * (core, desktop) must never resolve the docs page.
 */
export const HAS_DOCS = false;

/**
 * Where to send users to reach the editor app (app switcher, and the auth gate
 * bouncing non-admins out).
 *
 * Sourced from VITE_EDITOR_URL so it's configurable per deploy rather than
 * hardcoded. The committed default is "/" (production serves the editor at the
 * root on the same origin as the portal). For dev cross-app navigation to a
 * separately-running editor, set VITE_EDITOR_URL in portal/.env.local.
 */
export const EDITOR_URL = import.meta.env.VITE_EDITOR_URL;

/**
 * Where to send users to reach the editor app (app switcher, and the auth gate
 * bouncing non-admins out).
 *
 * Sourced from VITE_EDITOR_URL so it's configurable per deploy rather than
 * hardcoded, falling back to "/" (the editor serves the portal at /portal on
 * the same origin, so the root is the editor). For dev cross-app navigation to
 * a separately-running editor, set VITE_EDITOR_URL in editor/.env.local.
 */
export const EDITOR_URL = import.meta.env.VITE_EDITOR_URL || "/";

/**
 * When the editor is at the root of this origin, the portal and editor are
 * route-sets of one SPA — switching apps can be a client-side navigation
 * instead of a full page load.
 */
export const EDITOR_IS_SAME_APP = EDITOR_URL === "/";

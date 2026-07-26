import { withBasePath } from "@app/constants/app";

const CONFIGURED_EDITOR_URL = import.meta.env.VITE_EDITOR_URL || "";

/**
 * When the editor is at the root of this origin, the portal and editor are
 * route-sets of one SPA — switching apps can be a client-side navigation
 * instead of a full page load. True unless a distinct VITE_EDITOR_URL points at
 * a separately-running editor (dev cross-app setup).
 */
export const EDITOR_IS_SAME_APP =
  !CONFIGURED_EDITOR_URL || CONFIGURED_EDITOR_URL === "/";

/**
 * Where to send users to reach the editor app (app switcher, the auth gate
 * bouncing non-admins out, the "Open in browser" CTAs on the home hero and the
 * download-editor modal).
 *
 * Sourced from VITE_EDITOR_URL so it's configurable per deploy. When unset (the
 * editor is this same app at the origin root), it resolves to the deploy's base
 * path — so a subpath deploy (RUN_SUBPATH=/app → served under /app) lands on
 * /app/ rather than the origin root. These CTAs use window.location, which
 * bypasses the router basename, so the base path has to be baked in here. For
 * dev cross-app navigation to a separately-running editor, set VITE_EDITOR_URL
 * in editor/.env.local.
 */
export const EDITOR_URL = EDITOR_IS_SAME_APP
  ? withBasePath("/")
  : CONFIGURED_EDITOR_URL;

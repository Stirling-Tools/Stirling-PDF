import { withBasePath } from "@app/constants/app";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";

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
 * editor is this same app at the origin root), it resolves to the editor's own
 * route under the deploy's base path — so a subpath deploy (RUN_SUBPATH=/app →
 * served under /app) lands on /app/editor rather than the origin root. These
 * CTAs use window.location, which bypasses the router basename, so the base
 * path has to be baked in here. Targeting EDITOR_BASENAME rather than "/" also
 * keeps the switch out of the role-based router, which would bounce a processor
 * user straight back. For dev cross-app navigation to a separately-running
 * editor, set VITE_EDITOR_URL in editor/.env.local.
 */
export const EDITOR_URL = EDITOR_IS_SAME_APP
  ? withBasePath(EDITOR_BASENAME)
  : CONFIGURED_EDITOR_URL;

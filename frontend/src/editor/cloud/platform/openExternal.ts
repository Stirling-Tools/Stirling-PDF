/**
 * Open-external-URL seam (@app/platform/openExternal).
 *
 * The cloud/ layer is the SHARED hosted experience consumed by BOTH the saas
 * (web) and desktop (Tauri) leaves. Opening a URL in the user's real browser
 * differs per platform — saas hands it to the browser via window.open /
 * location.assign, desktop hands it to the OS via the Tauri shell plugin so it
 * escapes the embedded webview. Cloud code must not reach either of those
 * directly, so it opens external URLs through this seam.
 *
 * This module is the DEFAULT + the shared TypeScript contract. Real builds
 * shadow it with saas/platform/openExternal.ts and desktop/platform/
 * openExternal.ts; this default body is only reached by the cloud-standalone
 * typecheck, so it throws to make an accidental real-build resolution loud.
 */

/** Opens an external URL in the user's system browser. */
export type OpenExternal = (url: string) => Promise<void>;

/**
 * Opens an external URL in the user's system browser. Each platform supplies
 * its own implementation; this default is never reached in a real build.
 */
export const openExternal: OpenExternal = async (
  _url: string,
): Promise<void> => {
  throw new Error("openExternal: platform impl required");
};

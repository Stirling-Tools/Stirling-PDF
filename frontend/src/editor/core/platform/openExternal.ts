/**
 * core/web implementation of the @editor/platform/openExternal seam.
 *
 * The OSS / self-hosted web build runs in a normal browser, so an external URL
 * just opens in a new tab. The desktop (Tauri) and saas leaves shadow this with
 * their own platform/openExternal.ts. This lives in core/ so the seam also
 * resolves for the core and proprietary build variants - whose `@editor/*` maps to
 * src/core - since shared components (e.g. UpdateModal) import it.
 */
export const openExternal = async (url: string): Promise<void> => {
  window.open(url, "_blank", "noopener,noreferrer");
};

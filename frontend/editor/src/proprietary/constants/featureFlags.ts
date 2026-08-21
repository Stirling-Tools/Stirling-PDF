/**
 * Proprietary-build feature gates. Shadows `core/constants/featureFlags.ts` in
 * the proprietary build (resolved via the `@app/*` alias), so flags here only
 * affect proprietary/SaaS builds — the open-source core build keeps the core
 * values.
 */

/**
 * Watched Folders — a proprietary feature whose implementation lives under
 * `proprietary/`. Still disabled for now; flip to `true` to surface it in the
 * proprietary build only. The core override stays `false`, so the shared
 * sidebar entry point never appears in the open-source build (which has no
 * Watched Folders implementation to navigate to).
 */
export const WATCHED_FOLDERS_ENABLED: boolean = false;

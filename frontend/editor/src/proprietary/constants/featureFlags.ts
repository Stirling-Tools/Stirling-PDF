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

/**
 * Policies — automation-backed policy enforcement (the surface that runs the
 * classification policy on upload). Enabled in proprietary/self-hosted and SaaS
 * builds; the backend engine defaults on too (`policies.enabled=true` for the
 * `security` profile). The open-source core build keeps it `false`.
 */
export const POLICIES_ENABLED: boolean = true;

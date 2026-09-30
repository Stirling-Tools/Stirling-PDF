/**
 * Proprietary-build feature gates. Shadows `core/constants/featureFlags.ts` in
 * the proprietary build (resolved via the `@app/*` alias), so flags here only
 * affect proprietary/SaaS builds — the open-source core build keeps the core
 * values.
 */

// Refill an empty workbench from the tab's last session (survives the editor/processor switch).
export const WORKBENCH_SESSION_RESTORE: boolean = true;

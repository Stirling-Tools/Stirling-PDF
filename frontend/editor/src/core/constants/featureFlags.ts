/**
 * Build-time feature gates. Flip a flag back to `true` to re-enable a feature
 * that's been temporarily pulled from the UI.
 */

/**
 * Watched Folders. Disabled for now — gates both the custom workbench
 * registration (seeding, URL sync, view) and the sidebar entry point, so the
 * feature is unreachable from the UI. Flip to `true` to restore access.
 */
// Annotated as `boolean` (not the literal `false`) so call sites aren't treated
// as constant/unreachable conditions by the type checker and linter.
export const WATCHED_FOLDERS_ENABLED: boolean = false;

/**
 * Policies — a proprietary, automation-backed feature (like Watched Folders but
 * backend-driven, with non-folder triggers). The implementation lives under
 * `proprietary/`; this core value stays `false` so the shared sidebar entry
 * never appears in the open-source build.
 */
export const POLICIES_ENABLED: boolean = false;

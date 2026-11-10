/**
 * Build-time feature gates. Flip a flag back to `true` to re-enable a feature
 * that's been temporarily pulled from the UI.
 */

// Refill an empty workbench from the tab's last session (survives a provider remount or a reload).
export const WORKBENCH_SESSION_RESTORE: boolean = true;

// Edit image descriptions and decorative markers in the PDF text editor.
export const ACCESSIBILITY_EDITING: boolean =
  import.meta.env.VITE_ACCESSIBILITY_EDITING === "true";

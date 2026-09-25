/**
 * Proprietary/SaaS override: these builds ship the processor, so "/" is a
 * landing router (see RootGate) and the editor needs a URL of its own.
 *
 * Navigating here always lands on the editor - no lookup, no redirect - which is
 * what makes it the escape hatch for processor users who want the editor.
 * Mirrors PORTAL_BASENAME ("/processor").
 */
export const EDITOR_BASENAME = "/editor";

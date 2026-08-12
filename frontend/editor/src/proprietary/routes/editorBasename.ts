/**
 * Proprietary/SaaS override: these builds ship the processor, so "/" is a
 * role-based router (see RootRedirect) and the editor needs a URL of its own.
 *
 * Navigating here always lands on the editor - no role lookup, no redirect -
 * which is what makes it the escape hatch for processor users who want the
 * editor. Mirrors PROCESSOR_BASENAME ("/processor").
 */
export const EDITOR_BASENAME = "/editor";

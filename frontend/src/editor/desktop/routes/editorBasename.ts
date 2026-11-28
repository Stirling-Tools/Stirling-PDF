/**
 * Desktop override: the editor owns the root, as in core. The proprietary layer
 * moves it so "/" can route signed-in users to the Processor; desktop opens the
 * Processor only from the rail, so "/" stays the editor.
 */
export const EDITOR_BASENAME = "/";

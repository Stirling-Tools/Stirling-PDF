/**
 * Desktop override: the desktop app ships no processor, so it takes core's
 * behaviour back off the proprietary layer - nothing for "/" to route between,
 * and the editor owns the root.
 */
export const EDITOR_BASENAME = "/";

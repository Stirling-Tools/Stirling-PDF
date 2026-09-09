/**
 * Path the editor app calls home - where "back to all tools" and every
 * "return to the editor" navigation lands.
 *
 * Core ships no processor, so there is nothing for "/" to route between and the
 * editor simply owns the root. Builds that DO ship a processor override this
 * (see the proprietary copy): there "/" is a role-based router and the editor
 * moves to its own URL.
 */
export const EDITOR_BASENAME = "/";

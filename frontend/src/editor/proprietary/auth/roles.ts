/**
 * Role helpers shared across apps.
 *
 * The Spring backend serialises authorities into a single string (e.g.
 * "ROLE_ADMIN" or a space/comma separated list). Supabase carries roles in
 * app_metadata. Both normalise through {@link isAdminRole}.
 */

const ADMIN_TOKENS = new Set(["ADMIN", "ROLE_ADMIN"]);

/**
 * True when the supplied role string grants admin access. Tolerates a single
 * role ("ROLE_ADMIN"), a space/comma separated list, and casing differences.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return role
    .toUpperCase()
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((token) => ADMIN_TOKENS.has(token));
}

/** Self-hosted: the portal authenticates against the local Spring backend. */
// Typed as the union (not `as const`) so the flavor-select comparison in http.ts is valid.
export const portalAuthMode: "spring" | "supabase" = "spring";

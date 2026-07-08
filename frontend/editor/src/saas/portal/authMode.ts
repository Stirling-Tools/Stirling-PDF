/** SaaS: the portal authenticates with the Supabase web session (same as the app). */
// Typed as the union (not `as const`) so the flavor-select comparison in http.ts is valid.
export const portalAuthMode: "spring" | "supabase" = "supabase";

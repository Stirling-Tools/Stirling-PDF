/** The attended billing session is separate from the local Spring login. */
export { getSupabaseClient as getPortalSessionClient } from "@editor/auth/supabase/supabaseClient";
export { ensureSaasSupabase as ensurePortalSessionClient } from "@editor/portal/auth/saasSupabase";

export function handlePortalSessionRequired(): void {}

/** The attended billing session is separate from the local Spring login. */
export { getSupabaseClient as getPortalSessionClient } from "@app/auth/supabase/supabaseClient";
export { ensureSaasSupabase as ensurePortalSessionClient } from "@app/portal/auth/saasSupabase";

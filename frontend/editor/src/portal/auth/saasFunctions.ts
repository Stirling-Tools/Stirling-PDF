import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabaseClient } from "@app/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";
import { withPortalSaasSession } from "@portal/auth/portalSaasSession";

/** Attended edge calls share auth recovery; only explicitly read-only operations may be replayed. */
export async function invokeSaasFunction<T>(
  name: string,
  options: { body?: Record<string, unknown>; method?: "GET" | "POST" } = {},
  readOnly = false,
) {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("SaaS authentication is not configured");
  return withPortalSaasSession(
    (token) =>
      supabase.functions.invoke<T>(name, {
        ...options,
        headers: { Authorization: `Bearer ${token}` },
      }),
    ({ error }) =>
      error instanceof FunctionsHttpError && error.context.status === 401,
    readOnly,
  );
}

import { FunctionsHttpError } from "@supabase/supabase-js";
import {
  getPortalSessionClient,
  ensurePortalSessionClient,
} from "@app/portal/auth/sessionClient";
import { withPortalSaasSession } from "@app/portal/auth/portalSaasSession";

/** Attended edge calls share auth recovery; only explicitly read-only operations may be replayed. */
export async function invokeSaasFunction<T>(
  name: string,
  options: { body?: Record<string, unknown>; method?: "GET" | "POST" } = {},
  readOnly = false,
) {
  ensurePortalSessionClient();
  const supabase = getPortalSessionClient();
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

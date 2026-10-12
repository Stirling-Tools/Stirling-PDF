import { supabase } from "@app/auth/supabase";
export { redirectToLogin as handlePortalSessionRequired } from "@app/auth/redirectToLogin";

/** Hosted billing shares the app login and must never create an instance-link session. */
export function getPortalSessionClient() {
  return supabase;
}

export const ensurePortalSessionClient = getPortalSessionClient;

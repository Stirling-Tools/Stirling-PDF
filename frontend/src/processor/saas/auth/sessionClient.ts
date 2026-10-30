import { supabase } from "@editor/auth/supabase";
export { redirectToLogin as handlePortalSessionRequired } from "@editor/auth/redirectToLogin";

/** Hosted billing shares the app login and must never create an instance-link session. */
export function getPortalSessionClient() {
  return supabase;
}

export const ensurePortalSessionClient = getPortalSessionClient;

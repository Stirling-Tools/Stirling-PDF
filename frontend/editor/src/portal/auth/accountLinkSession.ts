import { clearSupabaseSession } from "@app/auth/supabase/supabaseClient";
import { clearPendingConnect } from "@portal/auth/pendingConnect";
import { getPortalQueryClient } from "@portal/queryClient";

const OWNER_KEY = "stirling.portalSaasOwner";

/** Local account changes require a new browser authorization, leaving the device link intact. */
export function bindAccountLinkSession(userId: string | null): void {
  if (userId && localStorage.getItem(OWNER_KEY) === userId) return;
  clearAccountLinkSession();
  if (userId) localStorage.setItem(OWNER_KEY, userId);
  else localStorage.removeItem(OWNER_KEY);
}

/** Clears attended credentials and data without signing out the SaaS origin's shared session. */
export function clearAccountLinkSession(): void {
  clearSupabaseSession();
  clearPendingConnect();
  getPortalQueryClient().clear();
}

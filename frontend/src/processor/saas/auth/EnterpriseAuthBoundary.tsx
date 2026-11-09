import { type ReactNode } from "react";
import { AuthProvider } from "@editor/auth";
import { ensureSaasSupabase } from "@processor/auth/saasSupabase";

/**
 * The hosted Enterprise page is where the website sends buyers, most of whom have no account yet,
 * so it is open to everyone: the page asks for sign-in only when the visitor starts something that
 * needs one. Same provider as the portal boundary, without its gate; the SaaS session provider is
 * already mounted by the platform above.
 */
export function EnterpriseAuthBoundary({ children }: { children: ReactNode }) {
  ensureSaasSupabase();
  return <AuthProvider mode="supabase">{children}</AuthProvider>;
}

import { type ReactNode } from "react";
import { AuthGate } from "@processor/components/AuthGate";

/**
 * Gates the self-hosted Processor on the platform's Spring session, using the
 * shared /login route. SaaS overrides this boundary to gate on the Supabase session.
 */
export function PortalAuthBoundary({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}

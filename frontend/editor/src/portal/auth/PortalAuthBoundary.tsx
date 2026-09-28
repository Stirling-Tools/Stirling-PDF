import { type ReactNode } from "react";
import { AuthProvider } from "@app/auth";
import { AuthGate } from "@portal/components/AuthGate";

/**
 * The self-hosted Processor owns its Spring session provider and uses the shared
 * /login route. SaaS overrides this boundary to use the editor's Supabase session.
 */
export function PortalAuthBoundary({ children }: { children: ReactNode }) {
  return (
    <AuthProvider mode="spring">
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}

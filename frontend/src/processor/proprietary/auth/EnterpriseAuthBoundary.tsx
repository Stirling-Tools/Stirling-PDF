import { type ReactNode } from "react";
import { PortalAuthBoundary } from "@processor/auth/PortalAuthBoundary";

/**
 * Self-hosted: the Enterprise page is reached from the server's own billing, by an operator who is
 * already signed in, so it keeps the portal's sign-in gate. The SaaS build shadows this to let
 * visitors from the website see the page before they have an account.
 */
export function EnterpriseAuthBoundary({ children }: { children: ReactNode }) {
  return <PortalAuthBoundary>{children}</PortalAuthBoundary>;
}

import type { ReactNode } from "react";
import { AccountLinkProvider } from "@app/portal/contexts/AccountLinkContext";
import { AccountLinkSessionBoundary } from "@app/portal/components/account-link/AccountLinkSessionBoundary";
import { ConnectCallbackHost } from "@app/portal/components/account-link/ConnectCallbackHost";
import { SaasSessionBanner } from "@app/portal/components/account-link/SaasSessionBanner";

/** Gives settings the same owner isolation and callback recovery as the processor. */
export function SettingsAccountLinkSession({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AccountLinkSessionBoundary>
      <AccountLinkProvider>
        <SaasSessionBanner />
        {children}
        <ConnectCallbackHost />
      </AccountLinkProvider>
    </AccountLinkSessionBoundary>
  );
}

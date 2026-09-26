import { AccountLinkProvider } from "@app/portal/contexts/AccountLinkContext";
import { AccountLinkSessionBoundary } from "@app/portal/components/account-link/AccountLinkSessionBoundary";
import { ConnectCallbackHost } from "@app/portal/components/account-link/ConnectCallbackHost";
import { LinkAccountModalHost } from "@app/portal/components/account-link/LinkAccountModal";

/** Handles an explicit roster sign-in request or its return from cloud authentication. */
export default function PortalRosterLinkFlow() {
  return (
    <AccountLinkSessionBoundary>
      <AccountLinkProvider>
        <LinkAccountModalHost />
        <ConnectCallbackHost />
      </AccountLinkProvider>
    </AccountLinkSessionBoundary>
  );
}

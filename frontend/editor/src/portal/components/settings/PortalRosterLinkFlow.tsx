import { AccountLinkProvider } from "@app/portal/contexts/AccountLinkContext";
import { AccountLinkSessionBoundary } from "@app/portal/components/account-link/AccountLinkSessionBoundary";
import { ConnectCallbackHost } from "@app/portal/components/account-link/ConnectCallbackHost";
import { LinkAccountModalHost } from "@app/portal/components/account-link/LinkAccountModal";

/** Mounted only after an explicit cloud sign-in request from the roster. */
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

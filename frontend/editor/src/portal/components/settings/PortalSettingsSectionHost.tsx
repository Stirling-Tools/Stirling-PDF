import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getPortalQueryClient } from "@portal/queryClient";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { TierProvider } from "@portal/contexts/TierContext";
import { UIProvider } from "@portal/contexts/UIContext";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import { useUI } from "@portal/contexts/UIContext";
import "@portal/theme/base.css";
import "@portal/components/settings/PortalSettingsSectionHost.css";

/** The one account-link dialog for this subtree, mounted only while open. */
function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal, connectOutcome } =
    useUI();
  if (!linkModalOpen) return null;
  return (
    <LinkAccountModal
      open
      mode={linkModalMode}
      onClose={closeLinkModal}
      outcome={connectOutcome}
    />
  );
}

/**
 * Runs a portal-authored view inside the settings page. Those views are written
 * against the portal's own data and UI contexts and its scoped CSS reset, none
 * of which the editor tree provides — this host supplies exactly that much of
 * the portal, and nothing of its chrome. The query client is the portal's
 * shared singleton, so a view opened here and the same view opened in the
 * processor read one cache.
 */
export function PortalSettingsSectionHost({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={getPortalQueryClient()}>
      <div className="portal-settings-section portal-scope">
        <LinkProvider initialState="unlinked">
          <TierProvider>
            <UIProvider>
              <AccountLinkProvider>
                <ErrorBoundary>{children}</ErrorBoundary>
                <LinkModalHost />
              </AccountLinkProvider>
            </UIProvider>
          </TierProvider>
        </LinkProvider>
      </div>
    </QueryClientProvider>
  );
}

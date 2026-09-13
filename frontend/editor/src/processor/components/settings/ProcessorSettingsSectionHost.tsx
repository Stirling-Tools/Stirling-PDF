import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getProcessorQueryClient } from "@processor/queryClient";
import { LinkProvider } from "@processor/contexts/LinkContext";
import { TierProvider } from "@processor/contexts/TierContext";
import { UIProvider } from "@processor/contexts/UIContext";
import { AccountLinkProvider } from "@processor/contexts/AccountLinkContext";
import { LinkAccountModal } from "@processor/components/account-link/LinkAccountModal";
import { ErrorBoundary } from "@processor/components/ErrorBoundary";
import { useUI } from "@processor/contexts/UIContext";
import "@processor/theme/base.css";
import "@processor/components/settings/ProcessorSettingsSectionHost.css";

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
 * Runs a processor-authored view inside the settings page. Those views are written
 * against the processor's own data and UI contexts and its scoped CSS reset, none
 * of which the editor tree provides — this host supplies exactly that much of
 * the processor, and nothing of its chrome. The query client is the processor's
 * shared singleton, so a view opened here and the same view opened in the
 * processor read one cache.
 */
export function ProcessorSettingsSectionHost({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={getProcessorQueryClient()}>
      <div className="processor-settings-section processor-scope">
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

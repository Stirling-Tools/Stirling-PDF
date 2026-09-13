import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState } from "@app/ui";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { useApplyLinkFacts } from "@processor/contexts/LinkContext";
import { useUI } from "@processor/contexts/UIContext";
import { useConnectGate } from "@processor/hooks/useConnectGate";
import { Usage } from "@processor/views/Usage";
import type { Wallet } from "@processor/api/billing";
import "@processor/components/settings/BillingSettingsSection.css";

/**
 * Usage & Billing as a settings section. The processor's route used
 * ConnectGuardedRoute, which answers "not linked" by navigating to the
 * processor home - inside settings that would throw the user out of the page
 * they just opened. Here an unlinked instance gets the ask in place instead.
 *
 * Usage must not render while unlinked: its onWalletLoaded reports linked as a
 * fact, and a browser can hold a SaaS session with no link to this server.
 */
export function BillingSettingsSection() {
  const { t } = useTranslation();
  const { gated, loading, connect } = useConnectGate();
  const applyLinkFacts = useApplyLinkFacts();
  const { openLinkModal } = useUI();

  const onWalletLoaded = useCallback(
    (w: Wallet) => applyLinkFacts(true, w.status === "subscribed"),
    [applyLinkFacts],
  );
  const onReauth = useCallback(() => openLinkModal("reauth"), [openLinkModal]);

  // Unknown is not gated: showing the ask first would flash it at a linked admin.
  if (loading) return <LoadingFallback />;

  if (gated) {
    return (
      <div className="billing-settings__gate">
        <EmptyState
          title={t("processor.nav.usage", "Usage & Billing")}
          description={t(
            "processor.accountLink.panel.sub",
            "Link this self-hosted org to its Stirling account so unattended processing bills against your org wallet.",
          )}
          actions={
            <Button variant="primary" onClick={connect}>
              {t(
                "processor.shell.sidebar.linkAccount",
                "Link Stirling account",
              )}
            </Button>
          }
        />
      </div>
    );
  }

  return <Usage onWalletLoaded={onWalletLoaded} onReauth={onReauth} />;
}

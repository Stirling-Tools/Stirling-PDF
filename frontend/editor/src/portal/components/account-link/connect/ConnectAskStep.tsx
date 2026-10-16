import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Banner } from "@app/ui";
import { isSaasSupabaseConfigured } from "@app/portal/auth/saasSupabase";
import { ConnectBenefitsSlide } from "@app/portal/components/account-link/connect/ConnectBenefitsSlide";
import { FreeTierExhaustedSummary } from "@app/portal/components/account-link/connect/FreeTierExhaustedSummary";
import { ExhaustedAccountLinkContent } from "@app/components/account-link/ExhaustedAccountLinkModal";
import "@app/components/account-link/connect.css";

interface Props {
  /** Re-auth says why it is being asked; a first link is pitched instead. */
  reauth: boolean;
  /**
   * Reached by spending this month's local free grant. Leads with the allowance connecting adds,
   * because whatever the caller was doing already works without an account.
   */
  exhausted?: boolean;
  /** A hand-off that failed to start drops back here, so this is where its reason belongs. */
  error?: string | null;
  /** Undefined uses the Processor ledger; null deliberately omits unavailable figures. */
  summary?: ReactNode;
}

export function ConnectAskStep({
  reauth,
  exhausted = false,
  error,
  summary,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      {reauth ? (
        <p className="portal-connect__lede">
          {t(
            "portal.accountLink.connect.handoff.reauthLede",
            "Your Stirling session expired. Signing in again keeps usage and billing visible. This server stays connected either way.",
          )}
        </p>
      ) : exhausted ? (
        <ExhaustedAccountLinkContent
          summary={
            summary === undefined ? <FreeTierExhaustedSummary /> : summary
          }
        />
      ) : (
        <ConnectBenefitsSlide />
      )}

      {!isSaasSupabaseConfigured && (
        <Banner
          tone="neutral"
          title={t(
            "portal.accountLink.modal.loginNotConfigured.title",
            "Stirling connection not configured",
          )}
        >
          {t("portal.accountLink.modal.loginNotConfigured.before", "Set")}{" "}
          <code>VITE_SUPABASE_URL</code>{" "}
          {t("portal.accountLink.modal.loginNotConfigured.and", "and")}{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY</code>{" "}
          {t(
            "portal.accountLink.modal.loginNotConfigured.after",
            "so this server can finish the connection when you come back.",
          )}
        </Banner>
      )}

      {error && <Banner tone="danger">{error}</Banner>}
    </>
  );
}

import { useTranslation } from "react-i18next";
import { Banner } from "@app/ui";
import { isSaasSupabaseConfigured } from "@portal/auth/saasSupabase";
import { ConnectBenefitsSlide } from "@portal/components/account-link/connect/ConnectBenefitsSlide";
import "@portal/components/account-link/connect/connect.css";

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
}

export function ConnectAskStep({ reauth, exhausted = false, error }: Props) {
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
      ) : (
        <>
          {exhausted && (
            <p className="portal-connect__lede">
              {t(
                "portal.accountLink.connect.exhaustedLede",
                "This server has used its free credits for the month. They reset when the period rolls over. Connecting a Stirling account adds a further monthly allowance on top.",
              )}
            </p>
          )}
          <ConnectBenefitsSlide />
        </>
      )}

      {!isSaasSupabaseConfigured && (
        <Banner
          tone="warning"
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

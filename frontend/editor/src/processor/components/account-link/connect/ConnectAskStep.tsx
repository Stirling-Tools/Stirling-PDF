import { useTranslation } from "react-i18next";
import { Banner } from "@app/ui";
import { isSaasSupabaseConfigured } from "@processor/auth/saasSupabase";
import { ConnectBenefitsSlide } from "@processor/components/account-link/connect/ConnectBenefitsSlide";
import "@processor/components/account-link/connect/connect.css";

interface Props {
  /** Re-auth says why it is being asked; a first link is pitched instead. */
  reauth: boolean;
  /** A hand-off that failed to start drops back here, so this is where its reason belongs. */
  error?: string | null;
}

export function ConnectAskStep({ reauth, error }: Props) {
  const { t } = useTranslation();

  return (
    <>
      {reauth ? (
        <p className="processor-connect__lede">
          {t(
            "processor.accountLink.connect.handoff.reauthLede",
            "Your Stirling session expired. Signing in again keeps usage and billing visible. This server stays connected either way.",
          )}
        </p>
      ) : (
        <ConnectBenefitsSlide />
      )}

      {!isSaasSupabaseConfigured && (
        <Banner
          tone="warning"
          title={t(
            "processor.accountLink.modal.loginNotConfigured.title",
            "Stirling connection not configured",
          )}
        >
          {t("processor.accountLink.modal.loginNotConfigured.before", "Set")}{" "}
          <code>VITE_SUPABASE_URL</code>{" "}
          {t("processor.accountLink.modal.loginNotConfigured.and", "and")}{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY</code>{" "}
          {t(
            "processor.accountLink.modal.loginNotConfigured.after",
            "so this server can finish the connection when you come back.",
          )}
        </Banner>
      )}

      {error && <Banner tone="danger">{error}</Banner>}
    </>
  );
}

import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth";
import { Banner, Button } from "@app/ui";
import { usePortalSaasSession } from "@portal/hooks/usePortalSaasSession";
import { useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";

/** Recovery for attended calls, including checkout and settings, without changing instance status. */
export function SaasSessionBanner() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { required } = usePortalSaasSession();
  const { isLinked } = useLink();
  const { openLinkModal } = useUI();
  if (!required || !isLinked || !isAdmin) return null;
  return (
    <Banner
      tone="warning"
      title={t("portal.accountLink.renewal.title", "Renew billing access")}
      action={
        <Button size="sm" onClick={() => openLinkModal("reauth")}>
          {t("portal.accountLink.modal.continueReauth", "Sign in again")}
        </Button>
      }
    >
      {t(
        "portal.usage.sessionExpired.body",
        "Your Stirling account session has expired. Sign in again to view billing — your instance stays linked.",
      )}
    </Banner>
  );
}

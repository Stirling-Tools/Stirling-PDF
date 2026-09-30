import { useTranslation } from "react-i18next";
import { useAccountLinkOwner } from "@app/portal/hooks/useAccountLinkOwner";
import { Banner, Button } from "@app/ui";
import { usePortalSaasSession } from "@app/portal/hooks/usePortalSaasSession";
import { useLink } from "@app/portal/contexts/LinkContext";
import { useUI } from "@app/portal/contexts/UIContext";

/** Recovery for attended calls, including checkout and settings, without changing instance status. */
export function SaasSessionBanner() {
  const { t } = useTranslation();
  const isOwner = useAccountLinkOwner();
  const { required } = usePortalSaasSession();
  const { isLinked } = useLink();
  const { openLinkModal, linkModalOpen } = useUI();
  if (!required || !isLinked || !isOwner || linkModalOpen) return null;
  return (
    <Banner
      tone="neutral"
      title={t("portal.accountLink.renewal.title", "Renew billing access")}
      action={
        <Button size="sm" onClick={() => openLinkModal("reauth")}>
          {t("portal.accountLink.modal.continueReauth", "Sign in again")}
        </Button>
      }
    >
      {t(
        "portal.usage.sessionExpired.body",
        "Your Stirling account session has expired. Sign in again to view billing. Your instance stays linked.",
      )}
    </Banner>
  );
}

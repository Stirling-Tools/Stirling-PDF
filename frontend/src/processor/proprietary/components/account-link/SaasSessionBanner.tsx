import { useTranslation } from "react-i18next";
import { useAccountLinkOwner } from "@editor/portal/hooks/useAccountLinkOwner";
import { Banner, Button } from "@editor/ui";
import { usePortalSaasSession } from "@editor/portal/hooks/usePortalSaasSession";
import { useLink } from "@editor/portal/contexts/LinkContext";
import { useUI } from "@editor/portal/contexts/UIContext";
import { useKeyLinked } from "@editor/portal/hooks/useKeyLinked";

/** Recovery for attended calls, including checkout and settings, without changing instance status. */
export function SaasSessionBanner() {
  const { t } = useTranslation();
  const isOwner = useAccountLinkOwner();
  const { required } = usePortalSaasSession();
  const { isLinked } = useLink();
  const { openLinkModal, linkModalOpen } = useUI();
  // A key-linked server manages billing on stirling.com, so there is no session here to renew.
  const keyLinked = useKeyLinked();
  if (!required || !isLinked || !isOwner || linkModalOpen || keyLinked)
    return null;
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
        "Your Stirling account session has expired. Sign in again to view billing — your instance stays linked.",
      )}
    </Banner>
  );
}

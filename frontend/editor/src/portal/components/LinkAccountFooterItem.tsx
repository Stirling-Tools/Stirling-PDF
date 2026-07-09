import { useTranslation } from "react-i18next";
import { NavItem } from "@app/ui";
import { useUI } from "@portal/contexts/UIContext";
import { useLink } from "@portal/contexts/LinkContext";
import { LinkIcon } from "@portal/components/icons";

/**
 * Sidebar-footer link-account CTA. Only visible when the org is unlinked — once
 * linked, the linked-instances row + plan badge already communicate the state,
 * so a permanent footer button would be noise. Click → opens the login modal
 * directly. The SaaS build shadows this file with a no-op: the signed-in account
 * IS the SaaS account, so there is nothing to link.
 */
export function LinkAccountFooterItem() {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  const { linkState } = useLink();
  if (linkState !== "unlinked") return null;
  return (
    <NavItem
      id="account-link"
      label={t("portal.shell.sidebar.linkAccount", "Link Stirling account")}
      icon={<LinkIcon />}
      onClick={() => openLinkModal()}
    />
  );
}

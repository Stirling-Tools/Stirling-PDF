import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAccountLinkOptional } from "@app/portal/contexts/AccountLinkContext";

import { useAccountLinkOwner } from "@app/portal/hooks/useAccountLinkOwner";
import { usePortalSaasSession } from "@app/portal/hooks/usePortalSaasSession";
import { useUI } from "@app/portal/contexts/UIContext";

/** Keep feature availability current without placing a notice on local pages. */
export function AccountConnectionRefresh() {
  const link = useAccountLinkOptional();
  const { refetch } = useAppConfig();
  const state = link?.status?.connection?.state;
  const previous = useRef(state);
  useEffect(() => {
    if (previous.current && previous.current !== state) {
      void refetch();
      window.dispatchEvent(new Event("stirling:billing-updated"));
    }
    previous.current = state;
  }, [state, refetch]);
  return null;
}

/** Contextual server-connection status for the owner's account and billing pages. */
export function AccountConnectionNotice() {
  const { t } = useTranslation();
  const link = useAccountLinkOptional();
  const isOwner = useAccountLinkOwner();
  const { required } = usePortalSaasSession();
  const { linkModalOpen } = useUI();
  const [checking, setChecking] = useState(false);
  const state = link?.status?.connection?.state;
  if (
    !isOwner ||
    required ||
    linkModalOpen ||
    !link ||
    !state ||
    state === "connected" ||
    state === "unlinked"
  )
    return null;
  const expired = state === "expired";
  const revoked = state === "revoked";
  const deadline = link.status?.connection?.offlineAccessUntil;
  return (
    <Banner
      tone={expired || revoked ? "danger" : "neutral"}
      title={
        expired
          ? t(
              "portal.accountLink.connectionNotice.expiredTitle",
              "Cloud access paused",
            )
          : revoked
            ? t(
                "portal.accountLink.connectionNotice.revokedTitle",
                "Account connection revoked",
              )
            : t(
                "portal.accountLink.connectionNotice.offlineTitle",
                "Stirling Cloud is unreachable",
              )
      }
      action={
        <Button
          size="sm"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            try {
              await link.refresh(true);
            } finally {
              setChecking(false);
            }
          }}
        >
          {t("portal.accountLink.connectionNotice.retry", "Check connection")}
        </Button>
      }
    >
      {expired
        ? t(
            "portal.accountLink.connectionNotice.expiredBody",
            "This server has not reached Stirling Cloud within its offline allowance. Cloud-backed Team features and Processor work are paused. Existing data and installed licence rights are preserved. Access returns automatically after a successful connection confirms your plan.",
          )
        : revoked
          ? t(
              "portal.accountLink.connectionNotice.revokedBody",
              "Stirling Cloud rejected this account connection. Reconnect the account in Settings to restore eligible cloud-backed features.",
            )
          : t(
              "portal.accountLink.connectionNotice.offlineBody",
              "Your last confirmed plan remains available until {{deadline}}. Restore this server’s connection before then to avoid pausing cloud-backed features and processing.",
              { deadline: deadline ? new Date(deadline).toLocaleString() : "" },
            )}
    </Banner>
  );
}

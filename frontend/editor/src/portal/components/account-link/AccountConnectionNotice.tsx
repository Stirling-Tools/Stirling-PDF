import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAccountLinkOptional } from "@portal/contexts/AccountLinkContext";

/** Shows the server's cloud-access deadline and refreshes feature visibility when it changes. */
export function AccountConnectionNotice() {
  const { t } = useTranslation();
  const link = useAccountLinkOptional();
  const { refetch } = useAppConfig();
  const state = link?.status?.connection?.state;
  const previous = useRef(state);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (previous.current && previous.current !== state) {
      void refetch();
      window.dispatchEvent(new Event("stirling:billing-updated"));
    }
    previous.current = state;
  }, [state, refetch]);
  if (!link || !state || state === "connected" || state === "unlinked")
    return null;
  const expired = state === "expired";
  const revoked = state === "revoked";
  const deadline = link.status?.connection?.offlineAccessUntil;
  return (
    <Banner
      tone={expired || revoked ? "danger" : "warning"}
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

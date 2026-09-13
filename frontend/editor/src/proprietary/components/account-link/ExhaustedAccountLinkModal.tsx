import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useClipboard } from "@mantine/hooks";
import { useAuth } from "@app/auth";
import { Button } from "@app/ui";
import { FlowModal } from "@app/components/shared/FlowModal";
import { StepModalHeader } from "@app/components/shared/StepModalHeader";
import { ConnectBenefitsSlide } from "@app/components/account-link/ConnectBenefitsSlide";

export interface ExhaustedAccountLinkModalProps {
  open: boolean;
  onClose: () => void;
  onStart?: () => void;
  /** The host reads the ledger; unavailable figures are omitted. */
  summary?: ReactNode;
  /** Web hosts supply content with connection configuration and handoff errors. */
  children?: ReactNode;
}

/** Shared content for the Processor, browser editor and native self-hosted connections. */
export function ExhaustedAccountLinkContent({
  summary,
}: {
  summary?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <p className="portal-connect__lede">
        {t(
          "portal.accountLink.connect.exhaustedLede",
          "This server has used its free credits for the month. Link a new or existing Stirling account to access your team’s monthly allowance.",
        )}
      </p>
      {summary}
      <ConnectBenefitsSlide />
    </>
  );
}

/** One exhaustion prompt, with administrator actions and member guidance determined by the host's auth. */
export function ExhaustedAccountLinkModal({
  open,
  onClose,
  onStart,
  summary,
  children,
}: ExhaustedAccountLinkModalProps) {
  const { t } = useTranslation();
  const { isAdmin, loading } = useAuth();
  const clipboard = useClipboard();
  const title = isAdmin
    ? t(
        "portal.accountLink.modal.exhaustedTitle",
        "Keep your workflows running",
      )
    : t(
        "portal.accountLink.connect.adminTitle",
        "Ask your server administrator",
      );
  const adminMessage = t(
    "portal.accountLink.connect.adminRequired",
    "Ask your server administrator to open Usage & billing and link a Stirling account for more monthly credits. Manual PDF tools are still available.",
  );
  return (
    <FlowModal
      open={open}
      onClose={onClose}
      label={title}
      footer={
        isAdmin ? (
          <>
            <Button variant="quiet" accent="neutral" onClick={onClose}>
              {t("portal.accountLink.connect.notNow", "Not now")}
            </Button>
            <Button
              variant="primary"
              onClick={onStart}
              disabled={loading || !onStart}
            >
              {t(
                "portal.accountLink.rail.exhaustedCta",
                "Link account for more credits",
              )}
            </Button>
          </>
        ) : (
          <>
            <Button variant="quiet" accent="neutral" onClick={onClose}>
              {t("portal.accountLink.connect.close", "Close")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => clipboard.copy(adminMessage)}
            >
              {clipboard.copied
                ? t("portal.accountLink.connect.copied", "Copied")
                : t(
                    "portal.accountLink.connect.copyAdminMessage",
                    "Copy message for administrator",
                  )}
            </Button>
          </>
        )
      }
    >
      <StepModalHeader
        brand
        title={title}
        closeLabel={t("portal.accountLink.connect.close", "Close")}
        onClose={onClose}
      />
      {isAdmin ? (
        (children ?? <ExhaustedAccountLinkContent summary={summary} />)
      ) : (
        <p className="portal-connect__lede">{adminMessage}</p>
      )}
    </FlowModal>
  );
}

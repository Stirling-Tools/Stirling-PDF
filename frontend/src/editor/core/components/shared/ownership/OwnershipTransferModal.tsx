import { Trans, useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import { FlowModal } from "@app/components/shared/FlowModal";
import { StepModalHeader } from "@app/components/shared/StepModalHeader";
import { Icon } from "@app/ui/Icon";
import { useOwnershipTransfer } from "@app/components/shared/ownership/useOwnershipTransfer";
import { ownershipErrorText } from "@app/components/shared/ownership/ownershipTransferErrors";
import { OwnershipTransferAccounts } from "@app/components/shared/ownership/OwnershipTransferAccounts";
import { OwnershipTransferMembership } from "@app/components/shared/ownership/OwnershipTransferMembership";
import { OwnershipTransferReview } from "@app/components/shared/ownership/OwnershipTransferReview";
import { OwnershipTransferActions } from "@app/components/shared/ownership/OwnershipTransferActions";
import type { OwnershipTransferProps } from "@app/components/shared/ownership/ownershipTransfer.types";
import "@app/components/shared/ownership/OwnershipTransferModal.css";

export type {
  CloudOwnershipStatus,
  OwnershipStatus,
  OwnershipTransferAdapter,
} from "@app/components/shared/ownership/ownershipTransfer.types";

/** Mounted for one recipient. Dismissal cancels preparation but preserves a committed cloud step. */
export function OwnershipTransferModal(props: OwnershipTransferProps) {
  const { t } = useTranslation();
  const flow = useOwnershipTransfer(props);
  const {
    close,
    busy,
    picker,
    done,
    partial,
    startFromInstance,
    error,
    ownerAccount,
    local,
    linked,
    status,
    canSignIn,
    cloudDone,
  } = flow;
  return (
    <FlowModal
      open
      onClose={close}
      label={t("ownership.title", "Transfer ownership")}
      disableBackdropClose
      disableEscapeClose={busy || picker.dropdownOpened}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL + 1}
      footer={
        <>
          <span className="ownership-flow__muted">
            {!done &&
              !partial &&
              !startFromInstance &&
              t("ownership.stayOwner", "You stay the owner until transfer.")}
          </span>
          <OwnershipTransferActions flow={flow} />
        </>
      }
    >
      <StepModalHeader
        brand={t("ownership.title", "Transfer ownership")}
        closeLabel={t("ownership.close", "Close transfer dialog")}
        onClose={busy ? undefined : close}
      />
      <div className="ownership-flow" aria-busy={busy}>
        {busy && (
          <p className="ownership-flow__muted" role="status">
            {t("ownership.working", "Checking and updating ownership…")}
          </p>
        )}
        {error && !startFromInstance && (
          <div
            className="ownership-flow__notice ownership-flow__notice--error"
            role="alert"
          >
            {ownershipErrorText(t, error, partial)}
          </div>
        )}
        {done ? (
          <div className="ownership-flow__success" role="status">
            <Icon name="circle-check" size={32} />
            <strong>{t("ownership.done", "Ownership transferred")}</strong>
            <p>
              <Trans
                t={t}
                i18nKey="ownership.newOwnerStyled"
                defaults="<user>{{name}}</user> is now the owner."
                values={{ name: ownerAccount }}
                components={{
                  user: <strong className="ownership-flow__username" />,
                }}
              />
            </p>
            <p className="ownership-flow__muted">
              {local && linked
                ? t(
                    "ownership.bothDone",
                    "Server and cloud ownership are now aligned.",
                  )
                : t("ownership.accessUpdated", "Their owner access is ready.")}
            </p>
          </div>
        ) : startFromInstance ? (
          <div role="alert">
            <strong>
              {t(
                "ownership.startFromInstanceTitle",
                "Start from your self-hosted server",
              )}
            </strong>
            <p>
              {t(
                "ownership.startFromInstanceBody",
                "This team has linked servers. On the self-hosted server, open Settings → Users and change the recipient's role to Org Owner. That flow transfers cloud ownership before completing the server transfer.",
              )}
            </p>
          </div>
        ) : (
          <>
            <OwnershipTransferAccounts flow={flow} />
            <OwnershipTransferMembership flow={flow} />
            <OwnershipTransferReview flow={flow} />
            {status?.cloud && canSignIn && !cloudDone && error && (
              <Button variant="secondary" disabled={busy} onClick={flow.signIn}>
                {t("ownership.signIn", "Sign in to cloud")}
              </Button>
            )}
            {!status && !busy && (
              <p className="ownership-flow__muted">
                {t(
                  "ownership.prepareHelp",
                  "The recipient must have completed their first server login. You can retry here, or return to Users to choose someone else.",
                )}
              </p>
            )}
          </>
        )}
      </div>
    </FlowModal>
  );
}

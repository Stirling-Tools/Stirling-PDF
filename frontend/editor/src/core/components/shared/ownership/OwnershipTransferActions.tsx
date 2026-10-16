import { useTranslation } from "react-i18next";
import type { OwnershipTransferFlow } from "@app/components/shared/ownership/useOwnershipTransfer";
import { Button } from "@app/ui/Button";

/** Selects the next action from confirmed handover state; the hook serializes its execution. */
export function OwnershipTransferActions({
  flow,
}: {
  flow: OwnershipTransferFlow;
}) {
  const { t } = useTranslation();
  const {
    done,
    startFromInstance,
    error,
    busy,
    editing,
    emailValid,
    matchingMember,
    status,
    partial,
    needsMember,
    invited,
    accepted,
  } = flow;
  if (done)
    return <Button onClick={flow.close}>{t("common.done", "Done")}</Button>;
  if (startFromInstance) return null;
  if (flow.canCancelRecovery)
    return (
      <Button disabled={busy} onClick={flow.cancel}>
        {t("ownership.cancel", "Cancel transfer")}
      </Button>
    );
  if (editing && !error)
    return (
      <Button
        disabled={
          busy ||
          !emailValid ||
          !flow.canSelectCloud ||
          (!matchingMember && !flow.canInvite)
        }
        onClick={flow.checkAccount}
      >
        {emailValid
          ? matchingMember
            ? t("ownership.checkAccount", "Check account")
            : t("ownership.invite", "Send invitation")
          : t("ownership.transfer", "Transfer ownership")}
      </Button>
    );
  if (!status || (error && !partial) || (needsMember && invited))
    return (
      <Button disabled={busy} onClick={flow.refresh}>
        {t("ownership.check", "Check again")}
      </Button>
    );
  if (needsMember)
    return (
      <Button disabled={busy || !flow.canInvite} onClick={flow.invite}>
        {t("ownership.invite", "Send invitation")}
      </Button>
    );
  return (
    <Button disabled={busy || (!accepted && !partial)} onClick={flow.transfer}>
      {partial
        ? t("ownership.finish", "Finish server transfer")
        : t("ownership.transfer", "Transfer ownership")}
    </Button>
  );
}

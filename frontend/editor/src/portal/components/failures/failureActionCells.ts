import type { TFunction } from "i18next";
import type { CellAction, CellMenuItem } from "@app/ui";
import { promoteActions } from "@app/components/notifications/notificationActionSlots";
import type { NotificationActionOffer } from "@app/services/notifications";
import type { FileRunEvent } from "@portal/api/fileRunEvents";

/** A row's actions as [Dismiss][menu], ordered by the bell's promotion rules. */

export interface FailureActionCellsOptions {
  event: FileRunEvent;
  t: TFunction;
  busyActionId?: string | null;
  /** Runs the offer against the actions endpoint. */
  onAction: (actionId: string) => void | Promise<void>;
  onCopyLog: () => void;
}

export function buildFailureActionCells({
  event,
  t,
  busyActionId,
  onAction,
  onCopyLog,
}: FailureActionCellsOptions): CellAction[] {
  // Server-executed only: a client action wants a workbench to land in, and reviewing
  // is meant to finish here rather than send the reviewer off into the editor.
  const offers = event.actions.filter((offer) => offer.execution === "SERVER");

  // Fixed button, so it sits out the promotion the rest contest.
  const dismiss = offers.find((offer) => offer.id === "DISMISS");
  const contested = offers.filter((offer) => offer.id !== "DISMISS");

  const { primary, secondary, overflow } = promoteActions(
    contested satisfies NotificationActionOffer[],
    () => true,
    () => true,
  );

  const labelOf = (offer: NotificationActionOffer) =>
    t(offer.labelKey, offer.defaultLabel);

  const buttons: CellAction[] = [];
  if (dismiss?.enabled) {
    buttons.push({
      label: labelOf(dismiss),
      loading: busyActionId === dismiss.id,
      disabled: busyActionId === dismiss.id,
      onClick: () => void onAction(dismiss.id),
    });
  }

  const menu: CellMenuItem[] = [primary, secondary, ...overflow]
    .filter((offer): offer is NotificationActionOffer => offer != null)
    .map((offer) => ({
      label: labelOf(offer),
      disabled: busyActionId === offer.id,
      onClick: () => void onAction(offer.id),
    }));
  if (event.detail) {
    menu.push({
      label: t("portal.failures.log.copy", "Copy log"),
      dividerBefore: menu.length > 0,
      onClick: onCopyLog,
    });
  }

  // Not gated on a button existing: a row with nothing runnable still owns its log.
  if (menu.length > 0) {
    buttons.push({
      label: t("notifications.action.more", "More options"),
      glyph: "kebab",
      iconOnly: true,
      menu,
    });
  }

  return buttons;
}

import type { TFunction } from "i18next";
import type { CellAction, CellMenuItem } from "@app/ui";
import { promoteActions } from "@app/components/notifications/notificationActionSlots";
import type { NotificationActionOffer } from "@app/services/notifications";
import type { FileRunEvent } from "@portal/api/fileRunEvents";

/** A row's actions as [primary][menu]: one button at most, everything else behind the kebab. */

export interface FailureActionCellsOptions {
  event: FileRunEvent;
  t: TFunction;
  busyActionId?: string | null;
  /** Runs the offer against the actions endpoint. */
  onAction: (actionId: string) => void | Promise<void>;
  /** Omitted for a row with no diagnostic, which has no error to show. */
  onViewError?: () => void;
  onCopyLog: () => void;
}

export function buildFailureActionCells({
  event,
  t,
  busyActionId,
  onAction,
  onViewError,
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
  // Reading the error is not what the row is for, so it only takes the button slot
  // when nothing the reviewer can act on has claimed it.
  const viewErrorInMenu = onViewError !== undefined && buttons.length > 0;
  if (onViewError && !viewErrorInMenu) {
    buttons.push({
      label: t("portal.failures.log.view", "View error"),
      onClick: onViewError,
    });
  }

  const menu: CellMenuItem[] = [primary, secondary, ...overflow]
    .filter((offer): offer is NotificationActionOffer => offer != null)
    .map((offer) => ({
      label: labelOf(offer),
      disabled: busyActionId === offer.id,
      onClick: () => void onAction(offer.id),
    }));
  // The diagnostic pair sits together, after whatever can be acted on.
  const diagnostics: CellMenuItem[] = [];
  if (viewErrorInMenu && onViewError) {
    diagnostics.push({
      label: t("portal.failures.log.view", "View error"),
      onClick: onViewError,
    });
  }
  if (event.detail) {
    diagnostics.push({
      label: t("portal.failures.log.copy", "Copy error"),
      onClick: onCopyLog,
    });
  }
  if (diagnostics.length > 0) {
    diagnostics[0]!.dividerBefore = menu.length > 0;
    menu.push(...diagnostics);
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

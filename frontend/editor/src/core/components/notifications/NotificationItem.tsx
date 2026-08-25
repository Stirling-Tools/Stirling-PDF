import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Menu, Tooltip } from "@mantine/core";
import { ActionIcon, Button } from "@app/ui";
import LocalIcon from "@app/components/shared/LocalIcon";
import { isResolvableHere } from "@app/hooks/useNotifications";
import type { NotificationDocumentState } from "@app/hooks/useNotifications";
import type {
  ClientActionRegistry,
  ClientActionSpec,
  NotificationActionContext,
} from "@app/components/notifications/notificationActions";
import { promoteActions } from "@app/components/notifications/notificationActionSlots";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";

/** An action that asked for a password, with everything running it needs. */
export interface PasswordPrompt {
  offer: NotificationActionOffer;
  spec: ClientActionSpec;
  context: NotificationActionContext;
  /** The row's title, so the prompt can say which failure it is unlocking for. */
  rowTitle: string;
}

/** The kind's own sentence, sharing the portal's copy. Empty for a kind this build has none for. */
function summaryKeyOf(titleKey: string): string {
  return titleKey.replace(/\.title$/, ".description");
}

/**
 * The server's reason wins, being about the failure rather than this browser. Otherwise only what we
 * actually looked up, so a row we never probed is never called absent.
 */
function noteFor(
  notification: AppNotification,
  documentState: NotificationDocumentState,
  withheldReasonKey: string | null,
  t: TFunction,
): string | null {
  if (withheldReasonKey)
    return t(withheldReasonKey, {
      defaultValue: t(
        "notifications.action.unavailable",
        "Not available for this notification.",
      ),
    });
  if (notification.ownership !== "MINE" || documentState.hasLocalFile)
    return null;
  if (!notification.fileId)
    return t(
      "notifications.noDocumentLinked",
      "This failure is not linked to a specific document, so it cannot be opened or retried here.",
    );
  return isResolvableHere(notification)
    ? t(
        "notifications.notOnThisDevice",
        "This document is not on this device, so it cannot be opened or retried here.",
      )
    : null;
}

interface NotificationItemProps {
  notification: AppNotification;
  unread: boolean;
  documentState: NotificationDocumentState;
  registry: ClientActionRegistry;
  onDismissPanel: () => void;
  /** Hand a password-collecting action to the panel, which owns the prompt. */
  onRequestPassword: (prompt: PasswordPrompt) => void;
}

/** Its own component because the last attempt's message and the copy state are per-row. */
export function NotificationItem({
  notification,
  unread,
  documentState,
  registry,
  onDismissPanel,
  onRequestPassword,
}: NotificationItemProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const title = t(notification.titleKey, notification.defaultTitle);
  const context: NotificationActionContext = {
    notification,
    hasLocalFile: documentState.hasLocalFile,
    retryPayload: documentState.retryPayload,
  };

  const { primary, secondary, overflow, withheldReasonKey } = promoteActions(
    notification.actions,
    (offer) => {
      const spec = registry[offer.id];
      // An id this build has never heard of: skipped, not rendered unwired. The server ships new kinds
      // and their actions ahead of the clients that understand them.
      if (!spec) return false;
      return spec.available(context);
    },
    // The withheld reason may come from an action this device cannot perform right now, but
    // never from one this build could not have rendered at all.
    (offer) => registry[offer.id] !== undefined,
  );

  const labelOf = (offer: NotificationActionOffer) =>
    t(offer.labelKey, offer.defaultLabel);

  const run = async (offer: NotificationActionOffer) => {
    if (busy) return;
    setMessage(null);

    const spec = registry[offer.id];
    if (!spec) return;
    // A password action is handed to the panel, which prompts for it and runs it from there.
    if (spec.needsPassword) {
      onRequestPassword({ offer, spec, context, rowTitle: title });
      return;
    }

    setBusy(offer.id);
    const outcome = await spec.run(context);
    setBusy(null);
    if (outcome && !outcome.ok) {
      setMessage(
        outcome.message ??
          t(
            "notifications.action.failed",
            "That did not work. Try again in a moment.",
          ),
      );
      return;
    }

    if (spec.closesPanel) onDismissPanel();
  };

  const copyDetail = async () => {
    if (!notification.detail) return;
    try {
      await navigator.clipboard.writeText(notification.detail);
      setCopied(true);
    } catch {
      // No clipboard permission. Nothing worth an error of its own: the copy simply stays unoffered.
    }
  };

  const note = noteFor(notification, documentState, withheldReasonKey, t);
  const summary = t(summaryKeyOf(notification.titleKey), { defaultValue: "" });

  return (
    <li
      className="notification-bell__item"
      data-severity={notification.severity.toLowerCase()}
    >
      {unread && (
        <span
          className="notification-bell__dot"
          aria-label={t("notifications.unread", "Unread")}
        />
      )}
      <span className="notification-bell__item-title">{title}</span>
      {notification.occurrences > 1 && (
        <span className="notification-bell__count">
          {t("notifications.occurrences", {
            count: notification.occurrences,
            defaultValue: "{{count}} times",
          })}
        </span>
      )}

      {summary && <span className="notification-bell__detail">{summary}</span>}

      {note && <span className="notification-bell__note">{note}</span>}

      {/* Two buttons at most, then a menu: the row's own answer, one runner-up, and the rest tucked
          out of the way so a row of near-equal buttons never competes for the click. The menu is not
          gated on a button existing: a row with no runnable action still owns its error log. */}
      {(primary || notification.detail) && (
        <span className="notification-bell__actions">
          {primary && (
            <ActionButton
              variant="primary"
              rowTitle={title}
              label={labelOf(primary)}
              busy={busy === primary.id}
              onRun={() => void run(primary)}
            />
          )}
          {secondary && (
            <ActionButton
              variant="secondary"
              rowTitle={title}
              label={labelOf(secondary)}
              busy={busy === secondary.id}
              onRun={() => void run(secondary)}
            />
          )}
          {(overflow.length > 0 || notification.detail) && (
            <Menu withinPortal position="bottom-end" shadow="md" width={180}>
              <Menu.Target>
                <Tooltip
                  label={t("notifications.action.more", "More options")}
                  withinPortal
                >
                  <ActionIcon
                    variant="tertiary"
                    size="sm"
                    className="notification-bell__more"
                    aria-label={`${t("notifications.action.more", "More options")}: ${title}`}
                  >
                    <LocalIcon icon="more-horiz" width={14} height={14} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown className="notification-bell__menu">
                {overflow.map((offer) => (
                  <Menu.Item
                    key={offer.id}
                    disabled={busy === offer.id}
                    onClick={() => void run(offer)}
                  >
                    {labelOf(offer)}
                  </Menu.Item>
                ))}
                {notification.detail && (
                  <Menu.Item
                    closeMenuOnClick={false}
                    onClick={() => void copyDetail()}
                  >
                    {copied
                      ? t("notifications.action.copiedLog", "Copied")
                      : t("notifications.action.copyLog", "Copy log")}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </span>
      )}

      {message && (
        <span className="notification-bell__message" role="alert">
          {message}
        </span>
      )}
    </li>
  );
}

interface ActionButtonProps {
  /** Solid for the row's answer, outlined for its runner-up, ghost for the rest. */
  variant: "primary" | "secondary" | "tertiary";
  rowTitle: string;
  label: string;
  busy: boolean;
  onRun: () => void;
}

function ActionButton({
  variant,
  rowTitle,
  label,
  busy,
  onRun,
}: ActionButtonProps) {
  return (
    <Button
      variant={variant}
      size="sm"
      fontSize="xs"
      className="notification-bell__cta"
      disabled={busy}
      // Every row's buttons read alike, so the label alone would not say which failure this acts on.
      aria-label={`${label}: ${rowTitle}`}
      onClick={onRun}
    >
      {label}
    </Button>
  );
}

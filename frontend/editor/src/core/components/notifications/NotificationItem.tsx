import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { isResolvableHere } from "@app/hooks/useNotifications";
import type { NotificationDocumentState } from "@app/hooks/useNotifications";
import type {
  ClientActionRegistry,
  NotificationActionContext,
} from "@app/components/notifications/notificationActions";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";

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
      "This failure is not linked to a specific document, so there is nothing to open here.",
    );
  return isResolvableHere(notification)
    ? t(
        "notifications.notOnThisDevice",
        "This document is not on this device, so it cannot be opened here.",
      )
    : null;
}

interface NotificationItemProps {
  notification: AppNotification;
  unread: boolean;
  documentState: NotificationDocumentState;
  registry: ClientActionRegistry;
  onDismissPanel: () => void;
}

/** Its own component because the last attempt's message and its expanded state are per-row. */
export function NotificationItem({
  notification,
  unread,
  documentState,
  registry,
  onDismissPanel,
}: NotificationItemProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const title = t(notification.titleKey, notification.defaultTitle);
  const context: NotificationActionContext = {
    notification,
    hasLocalFile: documentState.hasLocalFile,
  };

  // An id this build has never heard of is skipped rather than rendered unwired: the server ships
  // new kinds, and new actions, ahead of the clients that understand them.
  const usable = notification.actions.filter((offer) => {
    if (!offer.enabled) return false;
    const spec = registry[offer.id];
    return spec ? spec.available(context) : false;
  });

  // Only from an action this build would otherwise have rendered: a reason about one it cannot
  // perform anyway is not this row's explanation.
  const withheldReasonKey =
    notification.actions.find(
      (offer) =>
        !offer.enabled &&
        offer.disabledReasonKey !== null &&
        registry[offer.id] !== undefined,
    )?.disabledReasonKey ?? null;

  const labelOf = (offer: NotificationActionOffer) =>
    t(offer.labelKey, offer.defaultLabel);

  const run = async (offer: NotificationActionOffer) => {
    if (busy) return;
    setMessage(null);

    const spec = registry[offer.id];
    if (!spec) return;

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
      // No clipboard permission, and the message is on screen and selectable anyway.
    }
  };

  const note = noteFor(notification, documentState, withheldReasonKey, t);

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

      {notification.detail && (
        <>
          <span
            className={
              expanded
                ? "notification-bell__detail notification-bell__detail--full"
                : "notification-bell__detail"
            }
          >
            {notification.detail}
          </span>
          <span className="notification-bell__chrome">
            <button
              type="button"
              className="notification-bell__chip"
              aria-label={`${t("notifications.detail.copy", "Copy error")}: ${title}`}
              onClick={() => void copyDetail()}
            >
              {copied
                ? t("notifications.detail.copied", "Copied")
                : t("notifications.detail.copy", "Copy error")}
            </button>
            <button
              type="button"
              className="notification-bell__chip"
              aria-expanded={expanded}
              aria-label={`${
                expanded
                  ? t("notifications.detail.less", "Show less")
                  : t("notifications.detail.more", "Show full message")
              }: ${title}`}
              onClick={() => setExpanded((wasExpanded) => !wasExpanded)}
            >
              {expanded
                ? t("notifications.detail.less", "Show less")
                : t("notifications.detail.more", "Show full message")}
            </button>
          </span>
        </>
      )}

      {note && <span className="notification-bell__note">{note}</span>}

      {/* In the kind's declared order, the first leading. */}
      {usable.length > 0 && (
        <span className="notification-bell__actions">
          {usable.map((offer, index) => (
            <ActionButton
              key={offer.id}
              variant={index === 0 ? "primary" : "secondary"}
              rowTitle={title}
              label={labelOf(offer)}
              busy={busy === offer.id}
              onRun={() => void run(offer)}
            />
          ))}
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
  variant: "primary" | "secondary";
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

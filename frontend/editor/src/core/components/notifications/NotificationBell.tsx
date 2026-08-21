import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { BellIcon } from "@app/components/notifications/BellIcon";
import DividerWithText from "@app/components/shared/DividerWithText";
import {
  isResolvableHere,
  useNotifications,
} from "@app/hooks/useNotifications";
import {
  useNotificationActions,
  type ClientActionRegistry,
  type NotificationActionContext,
} from "@app/components/notifications/notificationActions";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";
import type { NotificationDocumentState } from "@app/hooks/useNotifications";
import "@app/components/notifications/NotificationBell.css";

/**
 * Renders whatever the server sends without knowing which subsystem produced it or what its actions
 * mean, so a new source or failure kind needs no change here. In core because both shells mount it.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, documentStateFor, markAllSeen } =
    useNotifications();
  const registry = useNotificationActions();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const headingId = useId();
  /**
   * Where the new ones stop, frozen on open. An id rather than a count because opening marks
   * everything read, and because one arriving on a poll must land above the divider, not shift it.
   */
  const [firstSeenId, setFirstSeenId] = useState<string | null>(null);
  // Fixed to the viewport: the workbench bar clips its overflow, so an absolutely positioned panel
  // would be cut off by its own toolbar.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = container.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  // Opening marks them read, not closing: waiting would leave the badge lit while they read.
  const toggle = () => {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        // Before marking, or there is nothing left to read.
        setFirstSeenId(notifications[unreadCount]?.id ?? null);
        markAllSeen();
      }
      return !wasOpen;
    });
  };

  /**
   * How many count as new. No boundary id means all of them were; one that has since left the list
   * leaves nothing to divide on, so it reads as none rather than guessing at a row.
   */
  const boundaryIndex = firstSeenId
    ? notifications.findIndex((notification) => notification.id === firstSeenId)
    : notifications.length;
  const dividedAt = Math.max(0, boundaryIndex);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!container.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="notification-bell" ref={container}>
      <Button
        variant="quiet"
        size="md"
        shape="circle"
        className="notification-bell__trigger"
        aria-label={t("notifications.open", "Notifications")}
        aria-expanded={open}
        onClick={toggle}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notification-bell__badge" aria-hidden>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          className="notification-bell__panel"
          role="dialog"
          // Named by its own heading: a dialog with no accessible name is announced as just "dialog".
          aria-labelledby={headingId}
          style={anchor ? { top: anchor.top, right: anchor.right } : undefined}
        >
          <h2 className="notification-bell__heading" id={headingId}>
            {t("notifications.title", "Notifications")}
          </h2>

          {notifications.length === 0 ? (
            <p className="notification-bell__empty">
              {t("notifications.empty", "Nothing to report.")}
            </p>
          ) : (
            <ul className="notification-bell__list">
              {notifications.map((notification, index) => (
                <Fragment key={notification.id}>
                  {index === 0 && dividedAt > 0 && (
                    <li aria-hidden>
                      <DividerWithText
                        text={t("notifications.section.new", "New")}
                      />
                    </li>
                  )}
                  {/* Only with something on both sides: a lone "Earlier" over everything says
                      nothing the empty badge has not. */}
                  {index === dividedAt && dividedAt > 0 && (
                    <li aria-hidden>
                      <DividerWithText
                        text={t("notifications.section.earlier", "Earlier")}
                      />
                    </li>
                  )}
                  <NotificationItem
                    notification={notification}
                    unread={index < dividedAt}
                    documentState={documentStateFor(notification)}
                    registry={registry}
                    onDismissPanel={() => setOpen(false)}
                  />
                </Fragment>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
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
function NotificationItem({
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

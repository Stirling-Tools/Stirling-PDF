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
import { Button, Input } from "@app/ui";
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
import { promoteActions } from "@app/components/notifications/notificationActionSlots";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";
import type { NotificationDocumentState } from "@app/hooks/useNotifications";
import "@app/components/notifications/NotificationBell.css";

/**
 * The bell and its panel. Lives in core because both shells mount it and the dependency only runs
 * one way: the portal may import from core, never the reverse.
 *
 * <p>Renders whatever the server sends without knowing which subsystem produced it, or what any of its
 * actions mean, so a new source or failure kind needs no change here.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, documentStateFor, markAllSeen, refresh } =
    useNotifications();
  const registry = useNotificationActions();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const headingId = useId();
  /**
   * The first notification the user had already seen when they opened the panel, which is where the
   * new ones stop. Held as an id rather than a count because opening marks everything read, so a
   * live count would collapse to zero and take the divider with it while they were reading.
   *
   * An id also survives the list changing underneath: one arriving on a poll lands above the
   * divider, where it belongs, instead of shifting a frozen index onto the wrong row.
   */
  const [firstSeenId, setFirstSeenId] = useState<string | null>(null);
  // Fixed to the viewport, positioned from the trigger. The workbench bar clips its overflow, so
  // an absolutely positioned panel is cut off by its own toolbar.
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

  // Opening is what marks them read, not closing: the user has seen them by then, and waiting
  // until close would leave the badge lit while they are looking at the list.
  const toggle = () => {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        // Read the boundary before marking, or there is nothing left to read.
        setFirstSeenId(notifications[unreadCount]?.id ?? null);
        markAllSeen();
      }
      return !wasOpen;
    });
  };

  /**
   * How many of the listed notifications count as new, for this reading of the panel. Everything
   * above it is new, everything from it down is earlier.
   *
   * No boundary id means everything was new when the panel opened, so the whole list is. A boundary
   * that has since left the list (dismissed elsewhere, its document deleted) leaves nothing to
   * divide on, and reads as "none new" rather than guessing at a row.
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
                  {/* Only where there is something on both sides of it: a lone "Earlier" heading
                      over the whole list says nothing the empty badge has not already said. */}
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
                    onChanged={refresh}
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
 * The row's one line of explanation, if it has earned one. The server's reason for what it withheld
 * wins, being about this failure rather than this browser; otherwise only what we actually know, so a
 * row we never look up is never called absent.
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
  /** The row changed something server-side; re-read rather than patch a local copy. */
  onChanged: () => void;
}

/**
 * One row. Its own component because the password it is collecting, the message its last attempt came
 * back with and whether that message is expanded are all per-row state the panel cannot hold.
 */
function NotificationItem({
  notification,
  unread,
  documentState,
  registry,
  onDismissPanel,
  onChanged,
}: NotificationItemProps) {
  const { t } = useTranslation();
  // Held only while the field is open, and dropped as soon as the row is done with it. Never stashed,
  // never logged.
  const [password, setPassword] = useState("");
  const [askingFor, setAskingFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
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
  );

  const labelOf = (offer: NotificationActionOffer) =>
    t(offer.labelKey, offer.defaultLabel);

  const run = async (offer: NotificationActionOffer) => {
    if (busy) return;
    setMessage(null);

    const spec = registry[offer.id];
    if (!spec) return;
    // First click on a password action opens the field, the second one runs it. An empty field means
    // the user clicked the button again rather than filling it in, so there is nothing to send yet.
    if (spec.needsPassword && (askingFor !== offer.id || password === "")) {
      setAskingFor(offer.id);
      return;
    }

    setBusy(offer.id);
    const outcome = await spec.run(
      context,
      spec.needsPassword ? password : undefined,
    );
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

    setPassword("");
    setAskingFor(null);
    // A password action resolves the incident server-side, so the row is expected to drop out.
    if (spec.needsPassword) onChanged();
    if (spec.closesPanel) onDismissPanel();
  };

  const copyDetail = async () => {
    if (!notification.detail) return;
    try {
      await navigator.clipboard.writeText(notification.detail);
      setCopied(true);
    } catch {
      // No clipboard permission. The message is on screen and selectable, so this needs no error.
    }
  };

  const asking = askingFor
    ? (notification.actions.find((offer) => offer.id === askingFor) ?? null)
    : null;

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
          {/* Chrome for the message itself, never part of the action slots: reading the failure and
              acting on it should not crowd each other out. */}
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

      {/* Actions were taken away from this row, so say why rather than leaving a bare row. */}
      {note && <span className="notification-bell__note">{note}</span>}

      {/* Every action the row has, in the server's order. Three is the most any kind offers once the
          unusable ones are dropped, so hiding the tail behind a menu would cost more than it saves. */}
      {primary && (
        <span className="notification-bell__actions">
          <ActionButton
            variant="primary"
            rowTitle={title}
            label={labelOf(primary)}
            busy={busy === primary.id}
            onRun={() => void run(primary)}
          />
          {secondary && (
            <ActionButton
              variant="secondary"
              rowTitle={title}
              label={labelOf(secondary)}
              busy={busy === secondary.id}
              onRun={() => void run(secondary)}
            />
          )}
          {overflow.map((offer) => (
            <ActionButton
              key={offer.id}
              variant="tertiary"
              rowTitle={title}
              label={labelOf(offer)}
              busy={busy === offer.id}
              onRun={() => void run(offer)}
            />
          ))}
        </span>
      )}

      {asking && (
        <form
          className="notification-bell__password"
          onSubmit={(event) => {
            event.preventDefault();
            void run(asking);
          }}
        >
          <Input
            type="password"
            inputSize="sm"
            autoFocus
            autoComplete="off"
            value={password}
            aria-label={`${t("notifications.password.label", "Document password")}: ${title}`}
            placeholder={t("notifications.password.label", "Document password")}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            fontSize="xs"
            disabled={password === "" || busy !== null}
          >
            {busy === asking.id
              ? t("notifications.password.working", "Unlocking...")
              : labelOf(asking)}
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            fontSize="xs"
            onClick={() => {
              setPassword("");
              setAskingFor(null);
              setMessage(null);
            }}
          >
            {t("notifications.password.cancel", "Cancel")}
          </Button>
        </form>
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
      // Every row's buttons say the same thing, so the label alone would not tell a screen reader which
      // failure it acts on.
      aria-label={`${label}: ${rowTitle}`}
      onClick={onRun}
    >
      {label}
    </Button>
  );
}

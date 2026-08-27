import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DividerWithText from "@app/components/shared/DividerWithText";
import { useNotifications } from "@app/hooks/useNotifications";
import type { ClientActionRegistry } from "@app/components/notifications/notificationActions";
import { NotificationItem } from "@app/components/notifications/NotificationItem";
import "@app/components/notifications/NotificationBell.css";

export interface NotificationPanelProps {
  onClose: () => void;
  /**
   * What each row may offer. Passed in rather than read here: the registry reaches into the
   * workbench, so it has to be built where those contexts are, and it also carries a one-shot
   * effect that picks up a document handed over from the processor - which has to keep running
   * whether the panel is open or not.
   */
  registry: ClientActionRegistry;
  /** Position for a panel anchored to its trigger; a placement class supplies it otherwise. */
  style?: React.CSSProperties;
  className?: string;
}

/**
 * The list of notifications. Mounted only while open - so a build that never opens it never
 * subscribes to the poll - and mounting is what marks them read.
 *
 * Separate from any one trigger because the triggers are in different trees: the quick nav rail
 * is rendered above the route split, while the actions a row offers (open this document, take me
 * to the failure) need the workbench contexts that only exist below it. Whoever owns the open
 * state mounts this where those contexts are, and the rail only asks for it to be opened.
 */
export function NotificationPanel({
  onClose,
  registry,
  style,
  className,
}: NotificationPanelProps) {
  const { t } = useTranslation();
  const { notifications, unreadCount, documentStateFor, markAllSeen } =
    useNotifications();
  const panel = useRef<HTMLDivElement>(null);
  const headingId = useId();
  // Where the new ones stop, frozen as the panel opens, since opening marks everything read.
  const [firstSeenId, setFirstSeenId] = useState<string | null>(null);

  // On mount rather than on close: waiting would leave the badge lit while the user reads.
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    // Before marking, or there is nothing left to read.
    setFirstSeenId(notifications[unreadCount]?.id ?? null);
    markAllSeen();
  }, [notifications, unreadCount, markAllSeen]);

  /**
   * How many count as new. No boundary id means all of them were; one that has since left the list
   * leaves nothing to divide on, so it reads as none rather than guessing at a row.
   */
  const boundaryIndex = firstSeenId
    ? notifications.findIndex((notification) => notification.id === firstSeenId)
    : notifications.length;
  const dividedAt = Math.max(0, boundaryIndex);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (panel.current?.contains(target)) return;
      // A trigger's own click toggles the panel shut by itself; counting it as an outside
      // click too would close and immediately reopen.
      if (target.closest?.("[data-notifications-trigger]")) return;
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={panel}
      className={
        className
          ? `notification-bell__panel ${className}`
          : "notification-bell__panel"
      }
      role="dialog"
      // Named by its own heading: a dialog with no accessible name is announced as just "dialog".
      aria-labelledby={headingId}
      style={style}
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
                onDismissPanel={onClose}
              />
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}

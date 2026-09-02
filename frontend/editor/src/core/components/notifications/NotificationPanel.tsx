import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DividerWithText from "@app/components/shared/DividerWithText";
import { useNotifications } from "@app/hooks/useNotifications";
import type { ClientActionRegistry } from "@app/components/notifications/notificationActions";
import { NotificationItem } from "@app/components/notifications/NotificationItem";
import "@app/components/notifications/NotificationBell.css";

/** Named so a trigger in another tree can point at it with aria-controls. */
export const NOTIFICATIONS_PANEL_ID = "quick-nav-notifications-panel";

export interface NotificationPanelProps {
  onClose: () => void;
  id?: string;
  /** Passed in: its document handover has to run whether the panel is open or not. */
  registry: ClientActionRegistry;
  style?: React.CSSProperties;
  className?: string;
}

/** Mounted only while open, since mounting is what marks everything read. */
export function NotificationPanel({
  onClose,
  registry,
  id,
  style,
  className,
}: NotificationPanelProps) {
  const { t } = useTranslation();
  const { notifications, unreadCount, documentStateFor, markAllSeen } =
    useNotifications();
  const panel = useRef<HTMLDivElement>(null);
  const headingId = useId();
  // Frozen on open, since opening marks them all read.
  const [firstSeenId, setFirstSeenId] = useState<string | null>(null);

  // On mount, not on close: waiting leaves the badge lit while they read.
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    // Before marking, or there is nothing left to divide on.
    setFirstSeenId(notifications[unreadCount]?.id ?? null);
    markAllSeen();
  }, [notifications, unreadCount, markAllSeen]);

  // No boundary means all were new; one that has left the list means none.
  const boundaryIndex = firstSeenId
    ? notifications.findIndex((notification) => notification.id === firstSeenId)
    : notifications.length;
  const dividedAt = Math.max(0, boundaryIndex);

  // Focus goes back to the opener only if it is still inside the panel on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => {
      if (panel.current?.contains(document.activeElement)) opener?.focus();
    };
  }, []);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (panel.current?.contains(target)) return;
      // A trigger closes this itself; counting it as outside would reopen it.
      if (target.closest?.("[data-notifications-trigger]")) return;
      // The overflow menu is portaled out, so a click in it would read as outside the panel.
      if (target.closest?.(".notification-bell__menu")) return;
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
      id={id}
      role="dialog"
      tabIndex={-1}
      aria-labelledby={headingId}
      style={style}
    >
      <h2 className="notification-bell__heading" id={headingId}>
        {t("notifications.title", "Notifications")}
      </h2>

      {notifications.length === 0 ? (
        <p className="notification-bell__empty">
          {t("notifications.empty", "You're all caught up.")}
        </p>
      ) : (
        <ul className="notification-bell__list">
          {notifications.map((notification, index) => (
            <Fragment key={notification.id}>
              {index === 0 && dividedAt > 0 && (
                <li aria-hidden>
                  <DividerWithText
                    className="notification-bell__divider notification-bell__divider--new"
                    text={t("notifications.section.new", "New")}
                  />
                </li>
              )}
              {/* Only with unread rows above it. */}
              {index === dividedAt && dividedAt > 0 && (
                <li aria-hidden>
                  <DividerWithText
                    className="notification-bell__divider"
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

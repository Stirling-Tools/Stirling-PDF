import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DividerWithText from "@app/components/shared/DividerWithText";
import { useNotifications } from "@app/hooks/useNotifications";
import type { ClientActionRegistry } from "@app/components/notifications/notificationActions";
import { NotificationItem } from "@app/components/notifications/NotificationItem";
import "@app/components/notifications/NotificationBell.css";

export interface NotificationPanelProps {
  onClose: () => void;
  /** Passed in: its one-shot document handover must run whether this is open or not. */
  registry: ClientActionRegistry;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Mounted only while open, so a closed panel never subscribes to the poll, and
 * mounting is what marks them read. Separate from its triggers, which live above the
 * route split while a row's actions need the workbench below it.
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
  // Frozen on open, since opening marks them all read.
  const [firstSeenId, setFirstSeenId] = useState<string | null>(null);

  // On mount, not on close: waiting leaves the badge lit while they read.
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    // Before marking, or there is nothing left to read.
    setFirstSeenId(notifications[unreadCount]?.id ?? null);
    markAllSeen();
  }, [notifications, unreadCount, markAllSeen]);

  // No boundary means all were new; one that has left the list means none.
  const boundaryIndex = firstSeenId
    ? notifications.findIndex((notification) => notification.id === firstSeenId)
    : notifications.length;
  const dividedAt = Math.max(0, boundaryIndex);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (panel.current?.contains(target)) return;
      // A trigger closes this itself; counting it as outside would reopen it.
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
      // A dialog with no accessible name is announced as just "dialog".
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
              {/* Only with something on both sides of it. */}
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

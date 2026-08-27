import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellIcon, Button } from "@app/ui";
import { useNotifications } from "@app/hooks/useNotifications";
import { useNotificationActions } from "@app/components/notifications/notificationActions";
import { NotificationPanel } from "@app/components/notifications/NotificationPanel";
import { useNotificationsAvailable } from "@app/components/notifications/useNotificationsAvailable";
import "@app/components/notifications/NotificationBell.css";

/** For the narrow layouts where the rail, which carries the bell, is off screen. */
export function NotificationBell() {
  // No API means no bell at all, rather than one polling an endpoint that isn't there.
  const available = useNotificationsAvailable();
  if (!available) return null;
  return <MountedNotificationBell />;
}

function MountedNotificationBell() {
  const { t } = useTranslation();
  const { unreadCount } = useNotifications();
  const registry = useNotificationActions();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  // Viewport-fixed, because the workbench bar clips its own overflow.
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

  return (
    <div className="notification-bell" ref={container}>
      <Button
        variant="quiet"
        size="md"
        shape="circle"
        className="notification-bell__trigger"
        // Read by the panel's outside-click handler.
        data-notifications-trigger
        aria-label={t("notifications.open", "Notifications")}
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notification-bell__badge" aria-hidden>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <NotificationPanel
          onClose={() => setOpen(false)}
          registry={registry}
          style={anchor ? { top: anchor.top, right: anchor.right } : undefined}
        />
      )}
    </div>
  );
}

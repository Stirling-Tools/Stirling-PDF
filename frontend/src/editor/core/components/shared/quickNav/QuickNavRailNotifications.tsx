import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { RailButton } from "@editor/components/shared/quickNav/QuickNavRailBase";
import { useNotifications } from "@editor/hooks/useNotifications";
import { useNotificationsAvailable } from "@editor/components/notifications/useNotificationsAvailable";
import { NOTIFICATIONS_PANEL_ID } from "@editor/components/notifications/NotificationPanel";

export interface QuickNavRailNotificationsProps {
  onToggle?: () => void;
  /** Whether the app's panel is open, which this button reports but does not own. */
  open?: boolean;
}

/** The count is read here; the app owns the panel - see NotificationPanel. */
export function QuickNavRailNotifications({
  onToggle,
  open = false,
}: QuickNavRailNotificationsProps) {
  // Gated before the count is read: subscribing starts the poll.
  const available = useNotificationsAvailable();
  if (!available) return null;
  return <MountedRailNotifications onToggle={onToggle} open={open} />;
}

function MountedRailNotifications({
  onToggle,
  open,
}: QuickNavRailNotificationsProps) {
  const { t } = useTranslation();
  const { unreadCount } = useNotifications();

  return (
    // Read by the panel's outside-click handler; on a wrapper, RailButton's props being fixed.
    <span data-notifications-trigger>
      <RailButton
        label={t("quickNav.notifications", "Notifications")}
        icon={<Icon name="bell" size="1.125rem" />}
        badge={unreadCount}
        expanded={Boolean(open)}
        controls={NOTIFICATIONS_PANEL_ID}
        onClick={() => onToggle?.()}
      />
    </span>
  );
}

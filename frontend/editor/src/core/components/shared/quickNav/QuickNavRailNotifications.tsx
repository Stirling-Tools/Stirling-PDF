import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { RailButton } from "@app/components/shared/quickNav/QuickNavRailBase";
import { useNotifications } from "@app/hooks/useNotifications";
import { useNotificationsAvailable } from "@app/components/notifications/useNotificationsAvailable";

export interface QuickNavRailNotificationsProps {
  /** Opens the panel, which the mounted app renders; absent until one has. */
  onToggle?: () => void;
}

/**
 * The bell in the rail's footer. The count is read here; the list is not - the app
 * owns the panel, since a row's actions need the workbench (see NotificationPanel).
 */
export function QuickNavRailNotifications({
  onToggle,
}: QuickNavRailNotificationsProps) {
  // Gated before the count is read: subscribing starts the poll.
  const available = useNotificationsAvailable();
  if (!available) return null;
  return <MountedRailNotifications onToggle={onToggle} />;
}

function MountedRailNotifications({
  onToggle,
}: QuickNavRailNotificationsProps) {
  const { t } = useTranslation();
  const { unreadCount } = useNotifications();

  return (
    // Read by the panel's outside-click handler. On a wrapper, since RailButton
    // takes a fixed prop set.
    <span data-notifications-trigger>
      <RailButton
        label={t("quickNav.notifications", "Notifications")}
        icon={
          <LocalIcon
            icon="notifications-outline-rounded"
            width="1.125rem"
            height="1.125rem"
          />
        }
        badge={unreadCount}
        onClick={() => onToggle?.()}
      />
    </span>
  );
}

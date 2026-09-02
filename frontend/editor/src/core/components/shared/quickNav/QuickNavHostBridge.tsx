import { useCallback, useMemo, useState } from "react";
import { useAccountIdentity } from "@app/hooks/useAccountIdentity";
import {
  NotificationPanel,
  NOTIFICATIONS_PANEL_ID,
} from "@app/components/notifications/NotificationPanel";
import { useNotificationActions } from "@app/components/notifications/notificationActions";
import { useQuickNavToolReasons } from "@app/components/shared/quickNav/useQuickNavToolReasons";
import { useNotificationsAvailable } from "@app/components/notifications/useNotificationsAvailable";
import { useSigningBadgeCount } from "@app/hooks/signing/useSigningBadgeCount";
import {
  useRegisterQuickNavHost,
  type QuickNavToolReasons,
} from "@app/contexts/QuickNavHostContext";
import type { ToolId } from "@app/types/toolId";

export interface QuickNavHostBridgeProps {
  portalAccess?: boolean;
  readerMode?: boolean;
  onSetReaderMode?: (on: boolean) => void;
  onOpenSettings?: () => void;
  requestNavigation?: (go: () => void) => void;
  onGoToDefaultState?: () => void;
  onSelectTool?: (toolId: ToolId) => void;
  activeTool?: ToolId | null;
  /** Merged over the reasons worked out here, for what only the app can see. */
  toolReasons?: QuickNavToolReasons;
}

/** Registers with the rail what only the app can see, and owns the notifications panel. */
export function QuickNavHostBridge({
  portalAccess = false,
  readerMode = false,
  onSetReaderMode,
  onOpenSettings,
  requestNavigation,
  onSelectTool,
  activeTool = null,
  onGoToDefaultState,
  toolReasons,
}: QuickNavHostBridgeProps) {
  const { displayName, profilePictureUrl } = useAccountIdentity();
  const signingBadge = useSigningBadgeCount();
  const notificationsAvailable = useNotificationsAvailable();
  // Built even when closed: it carries a one-shot document pickup that would sit unclaimed.
  const notificationActions = useNotificationActions();
  const endpointReasons = useQuickNavToolReasons();
  const mergedToolReasons = useMemo(() => {
    // An empty map from the app is silence, not an answer.
    const extra =
      toolReasons && Object.keys(toolReasons).length > 0 ? toolReasons : null;
    if (!endpointReasons && !extra) return undefined;
    return { ...endpointReasons, ...extra };
  }, [endpointReasons, toolReasons]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);

  useRegisterQuickNavHost(
    {
      identity: { displayName, profilePictureUrl },
      signingBadge,
      portalAccess,
      readerMode,
      activeTool,
      notificationsOpen,
      toolReasons: mergedToolReasons,
    },
    {
      openSettings: onOpenSettings,
      requestNavigation,
      selectTool: onSelectTool,
      setReaderMode: onSetReaderMode,
      goToDefaultState: onGoToDefaultState,
      toggleNotifications: () => setNotificationsOpen((open) => !open),
    },
  );

  // Mounted only while open, so a closed panel never subscribes to the poll.
  if (!notificationsAvailable || !notificationsOpen) return null;
  return (
    <NotificationPanel
      id={NOTIFICATIONS_PANEL_ID}
      onClose={closeNotifications}
      registry={notificationActions}
      className="notification-bell__panel--rail"
    />
  );
}

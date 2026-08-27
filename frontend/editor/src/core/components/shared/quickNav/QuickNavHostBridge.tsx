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
  onOpenSettings: () => void;
  /** Omitted where settings has no teams section, as in core. */
  onOpenTeams?: () => void;
  requestNavigation?: (go: () => void) => void;
  onGoToDefaultState?: () => void;
  onSelectTool?: (toolId: ToolId) => void;
  /** Layered over what this works out itself, for what only the app can see. */
  toolReasons?: QuickNavToolReasons;
}

/**
 * Publishes to the rail what it can't work out for itself, and owns the notifications
 * panel, whose rows need the workbench contexts that only exist down here. Both apps
 * mount this same one, so the account control can't differ across the switch.
 */
export function QuickNavHostBridge({
  portalAccess = false,
  readerMode = false,
  onSetReaderMode,
  onOpenSettings,
  onOpenTeams,
  requestNavigation,
  onSelectTool,
  onGoToDefaultState,
  toolReasons,
}: QuickNavHostBridgeProps) {
  const { displayName, profilePictureUrl } = useAccountIdentity();
  const signingBadge = useSigningBadgeCount();
  const notificationsAvailable = useNotificationsAvailable();
  // Unconditionally: the registry carries the one-shot pickup of a document handed
  // over from the processor, which would sit unclaimed if built only on open.
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
      notificationsOpen,
      toolReasons: mergedToolReasons,
    },
    {
      openSettings: onOpenSettings,
      openTeams: onOpenTeams,
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

import { useCallback, useMemo, useState } from "react";
import {
  NotificationPanel,
  NOTIFICATIONS_PANEL_ID,
} from "@editor/components/notifications/NotificationPanel";
import { useNotificationActions } from "@editor/components/notifications/notificationActions";
import { useNotificationPasswordPrompt } from "@editor/components/notifications/useNotificationPasswordPrompt";
import { useQuickNavToolReasons } from "@editor/components/shared/quickNav/useQuickNavToolReasons";
import { useSyncQuickNavAccount } from "@editor/components/shared/quickNav/useSyncQuickNavAccount";
import { useBrandFlourish } from "@editor/components/easterEgg/useBrandFlourish";
import { useNotificationsAvailable } from "@editor/components/notifications/useNotificationsAvailable";
import {
  useRegisterQuickNavView,
  type QuickNavToolReasons,
} from "@editor/contexts/QuickNavHostContext";
import type { ToolId } from "@editor/types/toolId";

export interface QuickNavHostBridgeProps {
  readerMode?: boolean;
  fileLibrary?: boolean;
  onSetReaderMode?: (on: boolean) => void;
  requestNavigation?: (go: () => void) => void;
  onGoToDefaultState?: () => void;
  onGoToStartupView?: () => void;
  onSelectTool?: (toolId: ToolId) => void;
  activeTool?: ToolId | null;
  onShowFileLibrary?: () => void;
  onCreateProcessingFolder?: () => void;
  /** Merged over the reasons worked out here, for what only the app can see. */
  toolReasons?: QuickNavToolReasons;
  /** Absent where there is no file workspace to open into, which drops the rail entry. */
  onOpenFromComputer?: () => void;
}

/** Registers with the rail what only the app can see, and owns the notifications panel. */
export function QuickNavHostBridge({
  readerMode = false,
  fileLibrary = false,
  onSetReaderMode,
  requestNavigation,
  onSelectTool,
  activeTool = null,
  onShowFileLibrary,
  onCreateProcessingFolder,
  onGoToDefaultState,
  onGoToStartupView,
  toolReasons,
  onOpenFromComputer,
}: QuickNavHostBridgeProps) {
  useSyncQuickNavAccount();
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
  const brandFlourish = useBrandFlourish();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);
  const { requestPassword, promptModal } =
    useNotificationPasswordPrompt(closeNotifications);

  useRegisterQuickNavView(
    {
      readerMode,
      fileLibrary,
      activeTool,
      notificationsOpen,
      toolReasons: mergedToolReasons,
    },
    {
      requestNavigation,
      selectTool: onSelectTool,
      setReaderMode: onSetReaderMode,
      showFileLibrary: onShowFileLibrary,
      createProcessingFolder: onCreateProcessingFolder,
      goToDefaultState: onGoToDefaultState,
      goToStartupView: onGoToStartupView,
      openFromComputer: onOpenFromComputer,
      toggleNotifications: () => setNotificationsOpen((open) => !open),
      onBrandFlourish: brandFlourish.trigger,
    },
  );

  return (
    <>
      {notificationsAvailable && (
        <>
          {/* Mounted only while open, so a closed panel never subscribes to the poll. */}
          {notificationsOpen && (
            <NotificationPanel
              id={NOTIFICATIONS_PANEL_ID}
              onClose={closeNotifications}
              registry={notificationActions}
              onRequestPassword={requestPassword}
              className="notification-bell__panel--rail"
            />
          )}
          {/* Outside the panel: an unlock closes it, and the prompt reports back afterwards. */}
          {promptModal}
        </>
      )}
      {brandFlourish.overlay}
    </>
  );
}

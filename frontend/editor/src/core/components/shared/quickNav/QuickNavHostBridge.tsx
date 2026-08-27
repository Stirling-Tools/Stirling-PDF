import { useCallback, useMemo, useState } from "react";
import { useAccountIdentity } from "@app/hooks/useAccountIdentity";
import { NotificationPanel } from "@app/components/notifications/NotificationPanel";
import { useNotificationActions } from "@app/components/notifications/notificationActions";
import { useQuickNavToolReasons } from "@app/components/shared/quickNav/useQuickNavToolReasons";
import { useNotificationsAvailable } from "@app/components/notifications/useNotificationsAvailable";
import { useSigningBadgeCount } from "@app/hooks/signing/useSigningBadgeCount";
import { useRegisterQuickNavHost } from "@app/contexts/QuickNavHostContext";

export interface QuickNavHostBridgeProps {
  /** The processor passes true; being in it is the proof. */
  portalAccess?: boolean;
  /** Whether this app is in reading mode, and how to change it. */
  readerMode?: boolean;
  onSetReaderMode?: (on: boolean) => void;
  /** Opens the settings menu, and a named section of it. */
  onOpenSettings: () => void;
  /** Omitted where the settings menu has no teams section, as in core. */
  onOpenTeams?: () => void;
  /** The editor's unsaved-changes guard; the processor has none to offer. */
  requestNavigation?: (go: () => void) => void;
  /** Returns this app to its default state; the brand mark calls it. */
  onGoToDefaultState?: () => void;
  /** Selects one of this app's tools; omitted by an app with none. */
  onSelectTool?: (toolId: string) => void;
  /**
   * Extra reasons, translated, keyed by entry id - layered over what this works out
   * itself, for conditions only the app can see. Optional.
   */
  toolReasons?: Record<string, string>;
}

/**
 * Publishes to the rail what it can't work out for itself, and owns the
 * notifications panel - the one surface the rail asks for but can't draw, since a
 * row's actions need the workbench contexts that only exist down here.
 *
 * Both apps mount this same component, so the account control and badge can't
 * differ across the switch. Only what genuinely differs is passed in.
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
  // Unconditionally: the registry also carries the one-shot pickup of a document
  // handed over from the processor, which would sit unclaimed if built only on open.
  const notificationActions = useNotificationActions();
  // Read here so the two apps can't disagree about the same entry.
  const endpointReasons = useQuickNavToolReasons();
  const mergedToolReasons = useMemo(() => {
    // An empty map from the app is silence, not an answer: it publishes one while
    // its own availability loads, which would undo the stickiness.
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
      onClose={closeNotifications}
      registry={notificationActions}
      className="notification-bell__panel--rail"
    />
  );
}

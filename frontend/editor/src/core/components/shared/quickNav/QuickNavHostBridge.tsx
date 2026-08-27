import { useCallback, useState } from "react";
import { useAccountIdentity } from "@app/hooks/useAccountIdentity";
import { NotificationPanel } from "@app/components/notifications/NotificationPanel";
import { useNotificationActions } from "@app/components/notifications/notificationActions";
import { useNotificationsAvailable } from "@app/components/notifications/useNotificationsAvailable";
import { useSigningBadgeCount } from "@app/hooks/signing/useSigningBadgeCount";
import { useRegisterQuickNavHost } from "@app/contexts/QuickNavHostContext";

export interface QuickNavHostBridgeProps {
  /**
   * Whether this user may open the processor. The processor itself passes true -
   * being in it is the proof - and the editor passes what its session says.
   */
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
   * Why each tool-opening rail entry cannot be used, keyed by entry id and already
   * translated; absent means it can. An app with no tools of its own passes none,
   * and the entries are drawn as usable - see QuickNavHostData.toolReasons.
   */
  toolReasons?: Record<string, string>;
}

/**
 * Publishes what the quick nav rail can't work out for itself: who you are, the
 * signing count, whether the processor is open to you, and how to reach settings.
 *
 * Deliberately the ONE of these - both apps mount this same component, so the bar
 * cannot end up with a different account control or a different badge depending on
 * which side of the switch you are on. Only what genuinely differs is passed in:
 * how that app opens its own settings.
 *
 * It also owns the notifications panel, which is the one surface the rail asks for
 * but cannot draw: a row offers to open the document it is about, and that reaches
 * for the workbench contexts, which exist here and not up where the rail lives.
 *
 * It exists at all because the rail sits outside both apps' providers - that is
 * what keeps it on screen when they swap - so these values are handed up rather
 * than read down.
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
  // Built here, and unconditionally, for two reasons: this is inside the app, where the
  // contexts a row's actions reach for exist, and the registry carries the one-shot pickup
  // of a document handed over from the processor. Building it only while the panel was open
  // would leave that handover sitting in storage, unclaimed.
  const notificationActions = useNotificationActions();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);

  useRegisterQuickNavHost(
    {
      identity: { displayName, profilePictureUrl },
      signingBadge,
      portalAccess,
      readerMode,
      toolReasons,
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

import { useAccountIdentity } from "@app/hooks/useAccountIdentity";
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
}

/**
 * Publishes what the quick nav rail can't work out for itself: who you are, the
 * signing count, whether the processor is open to you, and how to reach settings.
 *
 * Renders nothing, and is deliberately the ONE of these - both apps mount this
 * same component, so the bar cannot end up with a different account control or a
 * different badge depending on which side of the switch you are on. Only what
 * genuinely differs is passed in: how that app opens its own settings.
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
}: QuickNavHostBridgeProps) {
  const { displayName, profilePictureUrl } = useAccountIdentity();
  const signingBadge = useSigningBadgeCount();

  useRegisterQuickNavHost(
    {
      identity: { displayName, profilePictureUrl },
      signingBadge,
      portalAccess,
      readerMode,
    },
    {
      openSettings: onOpenSettings,
      openTeams: onOpenTeams,
      requestNavigation,
      selectTool: onSelectTool,
      setReaderMode: onSetReaderMode,
      goToDefaultState: onGoToDefaultState,
    },
  );

  return null;
}

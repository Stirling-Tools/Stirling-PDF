import { useTranslation } from "react-i18next";
import { NavSurface } from "@app/ui/NavSurface";
import LocalIcon from "@app/components/shared/LocalIcon";
import {
  QuickNavAppSwitch,
  type QuickNavAppSwitchProps,
} from "@app/components/shared/quickNav/QuickNavAppSwitch";
import type { QuickNavIdentity } from "@app/contexts/QuickNavHostContext";
import {
  QuickNavRailBase,
  RailButton,
  type QuickNavRailBaseProps,
} from "@app/components/shared/quickNav/QuickNavRailBase";
import { QuickNavRailAccount } from "@app/components/shared/quickNav/QuickNavRailAccount";
import "@app/components/shared/quickNav/QuickNavRailContainer.css";

export type {
  QuickNavEntry,
  QuickNavTarget,
} from "@app/components/shared/quickNav/QuickNavRailBase";

export interface QuickNavRailContainerProps extends Omit<
  QuickNavRailBaseProps,
  "footer"
> {
  /**
   * Opens the config modal. This rail is the account control in both apps, so
   * the sidebar beside it renders no account row of its own (FileSidebar's
   * accountHoisted, NavFooter's showAccount) and one user is never drawn twice.
   */
  onOpenSettings?: () => void;
  /**
   * Opens the teams section of the settings menu. Omitted by builds whose
   * settings has no such section - core and desktop - rather than offering a
   * shortcut to somewhere that doesn't exist.
   */
  onOpenTeams?: () => void;
  /**
   * Placeholder notifications bell - there is no notifications surface behind it
   * yet, so it holds the slot without doing anything. Gated on the same signal as
   * the processor entry, and disabled with `reason` when that signal is off, so
   * the two can't disagree about who sees it.
   */
  notifications?: { disabled: boolean; reason?: string; badge?: number };
  /** Identity for the account control; see QuickNavRailAccount. */
  identity?: QuickNavIdentity | null;
  /** The brand mark and app switcher, which share a pair of slots. */
  appSwitch: QuickNavAppSwitchProps;
}

/**
 * The fixed-width column the rail sits in: one full-height bar, with the groups
 * inside it separated by a divider.
 */
export function QuickNavRailContainer({
  onOpenSettings,
  onOpenTeams,
  notifications,
  identity = null,
  appSwitch,
  ...railProps
}: QuickNavRailContainerProps) {
  const { t } = useTranslation();
  return (
    <div className="quick-nav-rail-container">
      {/* The corner both carries the brand and says which app you are in, with
          the other app directly below it. Not wrapped in a fixed row: the block
          is taller than one when a second app exists, and centring it in a
          brand-height row would drop the mark out of line with the sidebar's
          wordmark beside it. */}
      <QuickNavAppSwitch {...appSwitch} />
      <NavSurface className="quick-nav-rail-surface">
        <QuickNavRailBase
          {...railProps}
          footer={
            notifications || onOpenTeams || onOpenSettings ? (
              <div className="quick-nav-rail-footer">
                {notifications && (
                  <RailButton
                    label={t("quickNav.notifications", "Notifications")}
                    icon={
                      <LocalIcon
                        icon="notifications-outline-rounded"
                        width="1.125rem"
                        height="1.125rem"
                      />
                    }
                    badge={notifications.badge}
                    disabled={notifications.disabled}
                    reason={notifications.reason}
                    // Nothing to open yet; the slot is here so its position is
                    // settled before the surface behind it exists.
                    onClick={() => {}}
                  />
                )}
                {onOpenTeams && (
                  <RailButton
                    label={t("settings.workspace.teams", "Teams")}
                    icon={
                      <LocalIcon
                        icon="groups-outline-rounded"
                        width="1.125rem"
                        height="1.125rem"
                      />
                    }
                    onClick={onOpenTeams}
                  />
                )}
                {onOpenSettings && (
                  <QuickNavRailAccount
                    onOpenSettings={onOpenSettings}
                    identity={identity}
                  />
                )}
              </div>
            ) : undefined
          }
        />
      </NavSurface>
    </div>
  );
}

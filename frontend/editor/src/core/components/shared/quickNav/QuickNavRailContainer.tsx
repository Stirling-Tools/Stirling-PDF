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
import { QuickNavRailNotifications } from "@app/components/shared/quickNav/QuickNavRailNotifications";
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
   * The rail is the account control in both apps, so the sidebars render no account
   * row of their own (FileSidebar's accountHoisted, NavFooter's showAccount).
   */
  onOpenSettings?: () => void;
  /** Omitted by builds whose settings has no teams section (core, desktop). */
  onOpenTeams?: () => void;
  /** The bell draws itself; the panel belongs to the app - see QuickNavRailNotifications. */
  onToggleNotifications?: () => void;
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
  onToggleNotifications,
  identity = null,
  appSwitch,
  ...railProps
}: QuickNavRailContainerProps) {
  const { t } = useTranslation();
  return (
    <div className="quick-nav-rail-container">
      {/* Not wrapped in a fixed row: the block is taller than one when a second app
          exists, and centring it would drop the mark out of line with the
          sidebar's wordmark beside it. */}
      <QuickNavAppSwitch {...appSwitch} />
      <NavSurface className="quick-nav-rail-surface">
        <QuickNavRailBase
          {...railProps}
          footer={
            // Always rendered: an empty footer collapses to nothing, and gating it
            // on the app's own controls dropped the bell along with them.
            <div className="quick-nav-rail-footer">
              <QuickNavRailNotifications onToggle={onToggleNotifications} />
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
          }
        />
      </NavSurface>
    </div>
  );
}

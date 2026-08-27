import { useTranslation } from "react-i18next";
import { NavSurface } from "@app/ui/NavSurface";
import LocalIcon from "@app/components/shared/LocalIcon";
import { QuickNavBrand } from "@app/components/shared/quickNav/QuickNavBrand";
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
  /** The sidebars render no account row of their own (accountHoisted, showAccount). */
  onOpenSettings?: () => void;
  /** Omitted by builds whose settings has no teams section (core, desktop). */
  onOpenTeams?: () => void;
  onToggleNotifications?: () => void;
  notificationsOpen?: boolean;
  identity?: QuickNavIdentity | null;
  onReturnHome: () => void;
}

/** The fixed-width column the rail sits in. */
export function QuickNavRailContainer({
  onOpenSettings,
  onOpenTeams,
  onToggleNotifications,
  notificationsOpen,
  identity = null,
  onReturnHome,
  ...railProps
}: QuickNavRailContainerProps) {
  const { t } = useTranslation();
  return (
    <div className="quick-nav-rail-container">
      <QuickNavBrand onReturnHome={onReturnHome} />
      <NavSurface className="quick-nav-rail-surface">
        <QuickNavRailBase
          {...railProps}
          footer={
            // Always rendered: gating it on the app's controls dropped the bell too.
            <div className="quick-nav-rail-footer">
              <QuickNavRailNotifications
                onToggle={onToggleNotifications}
                open={notificationsOpen}
              />
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

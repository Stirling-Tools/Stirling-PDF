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
  /** The rail owns the settings and account controls, so the sidebars drop their own row. */
  onOpenSettings?: () => void;
  /** The avatar's own destination; falls back to settings. */
  onOpenAccount?: () => void;
  /** Settings is a page like any other; the gear marks it the way apps do. */
  settingsActive?: boolean;
  /** The account section specifically, so the avatar can claim it instead. */
  accountActive?: boolean;
  /** Omitted in builds with no processor to invite anyone into. */
  onInvite?: () => void;
  onToggleNotifications?: () => void;
  notificationsOpen?: boolean;
  identity?: QuickNavIdentity | null;
  onReturnHome: () => void;
}

/** The fixed-width column the rail sits in. */
export function QuickNavRailContainer({
  onOpenSettings,
  onOpenAccount,
  settingsActive = false,
  accountActive = false,
  onInvite,
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
            // Always rendered: the bell lives here too, so gating the footer hides it.
            <div className="quick-nav-rail-footer">
              <QuickNavRailNotifications
                onToggle={onToggleNotifications}
                open={notificationsOpen}
              />
              {onInvite && (
                <RailButton
                  label={t("quickNav.invite", "Invite")}
                  icon={
                    <LocalIcon
                      icon="person-add-outline-rounded"
                      width="1.125rem"
                      height="1.125rem"
                    />
                  }
                  onClick={onInvite}
                />
              )}
              {onOpenSettings && (
                <RailButton
                  label={t("quickNav.settings", "Settings")}
                  icon={
                    settingsActive ? (
                      <LocalIcon
                        icon="settings-rounded"
                        width="1.125rem"
                        height="1.125rem"
                      />
                    ) : (
                      <LocalIcon
                        icon="settings-outline-rounded"
                        width="1.125rem"
                        height="1.125rem"
                      />
                    )
                  }
                  current={settingsActive}
                  testId="settings-button"
                  onClick={onOpenSettings}
                />
              )}
              {onOpenSettings && (
                <QuickNavRailAccount
                  onOpenSettings={onOpenAccount ?? onOpenSettings}
                  identity={identity}
                  active={accountActive}
                />
              )}
            </div>
          }
        />
      </NavSurface>
    </div>
  );
}

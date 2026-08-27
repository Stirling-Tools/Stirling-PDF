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
  /** The rail owns the account control, so the sidebars drop their own row. */
  onOpenSettings?: () => void;
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

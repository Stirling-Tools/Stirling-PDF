import { useTranslation } from "react-i18next";
import { NavSurface } from "@app/ui/NavSurface";
import { Logo } from "@app/ui/Logo";
import LocalIcon from "@app/components/shared/LocalIcon";
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
   * Opens the config modal. Passing it also opts this rail into owning the
   * account control, which means the sidebar beside it must drop its own account
   * row (FileSidebar's accountHoisted) so one user isn't drawn twice. The editor
   * does this; the processor leaves the account in its sidebar footer and passes
   * nothing here.
   */
  onOpenSettings?: () => void;
  /**
   * Opens the teams section of the settings menu. Omitted by builds whose
   * settings has no such section - core and desktop - rather than offering a
   * shortcut to somewhere that doesn't exist.
   */
  onOpenTeams?: () => void;
}

/**
 * The fixed-width column the rail sits in: one full-height bar, with the groups
 * inside it separated by a divider.
 */
export function QuickNavRailContainer({
  onOpenSettings,
  onOpenTeams,
  ...railProps
}: QuickNavRailContainerProps) {
  const { t } = useTranslation();
  return (
    <div className="quick-nav-rail-container">
      {/* The brand mark, in the leftmost column and above everything else, so it
          occupies the true top-left corner. Outside the nav landmark: it labels
          the product, it is not somewhere you can navigate to. The wordmark
          beside it belongs to the sidebar, which can afford the width. */}
      <div className="quick-nav-rail-brand">
        <Logo variant="iconOnly" iconHeight="1.6rem" />
      </div>
      <NavSurface className="quick-nav-rail-surface">
        <QuickNavRailBase
          {...railProps}
          footer={
            onOpenTeams || onOpenSettings ? (
              <div className="quick-nav-rail-footer">
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
                    kind="action"
                    onClick={onOpenTeams}
                  />
                )}
                {onOpenSettings && (
                  <QuickNavRailAccount onOpenSettings={onOpenSettings} />
                )}
              </div>
            ) : undefined
          }
        />
      </NavSurface>
    </div>
  );
}

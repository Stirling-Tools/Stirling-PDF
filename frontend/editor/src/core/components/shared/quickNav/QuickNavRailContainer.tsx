import { NavSurface } from "@app/ui/NavSurface";
import {
  QuickNavRailBase,
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
   * account control - the editor does, having given that footer up from the
   * bottom of its file sidebar.
   */
  onOpenSettings?: () => void;
}

/**
 * The fixed-width column the rail sits in: one full-height bar, with the groups
 * inside it separated by a divider.
 */
export function QuickNavRailContainer({
  onOpenSettings,
  ...railProps
}: QuickNavRailContainerProps) {
  return (
    <div className="quick-nav-rail-container">
      <NavSurface className="quick-nav-rail-surface">
        <QuickNavRailBase
          {...railProps}
          footer={
            onOpenSettings ? (
              <QuickNavRailAccount onOpenSettings={onOpenSettings} />
            ) : undefined
          }
        />
      </NavSurface>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavSurface } from "@app/ui/NavSurface";
import LocalIcon from "@app/components/shared/LocalIcon";
import { BrandMark } from "@app/components/shared/BrandMark";
import { BrandTile } from "@app/components/shared/BrandTile";
import { consumeAppSwap } from "@app/utils/appSwap";
import {
  QuickNavRailBase,
  RailButton,
  type QuickNavRailBaseProps,
} from "@app/components/shared/quickNav/QuickNavRailBase";
import { QuickNavRailAccount } from "@app/components/shared/quickNav/QuickNavRailAccount";
import "@app/components/shared/quickNav/QuickNavRailContainer.css";

// PLACEHOLDER counts, so the badge design can be judged before the features
// behind them exist. Delete both when they do: notifications has no source at
// all, and shared signing already has a real one that wins whenever it is
// non-zero.
const PLACEHOLDER_NOTIFICATION_COUNT = 3;

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
  notifications?: { disabled: boolean; reason?: string };
  /**
   * Which app this rail belongs to. Its mark becomes the brand above the bar, so
   * the corner says where you are; the switcher below holds only the other app.
   */
  currentApp?: "editor" | "processor";
}

/**
 * The fixed-width column the rail sits in: one full-height bar, with the groups
 * inside it separated by a divider.
 */
export function QuickNavRailContainer({
  onOpenSettings,
  onOpenTeams,
  notifications,
  currentApp = "editor",
  ...railProps
}: QuickNavRailContainerProps) {
  const { t } = useTranslation();
  // Read in an effect, not a state initialiser: StrictMode double-invokes both,
  // but a ref survives that, so the flag is consumed exactly once and a genuine
  // switch can't be swallowed by the second pass.
  const [swapped, setSwapped] = useState(false);
  const checkedSwap = useRef(false);
  useEffect(() => {
    if (checkedSwap.current) return;
    checkedSwap.current = true;
    if (consumeAppSwap()) setSwapped(true);
  }, []);
  return (
    <div className="quick-nav-rail-container" data-app-swapped={swapped || undefined}>
      {/* The mark of the app you are in, in the leftmost column and above
          everything else, so the corner both carries the brand and says where you
          are. Outside the nav landmark: it labels the product, it is not somewhere
          you can navigate to. The wordmark beside it belongs to the sidebar,
          which can afford the width. */}
      <div className="quick-nav-rail-brand">
        {currentApp === "processor" ? (
          <BrandMark height="1.6rem" />
        ) : (
          <BrandTile size="1.6rem" />
        )}
      </div>
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
                    kind="action"
                    badge={PLACEHOLDER_NOTIFICATION_COUNT}
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

import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { Avatar } from "@app/ui/Avatar";
import type { QuickNavIdentity } from "@app/contexts/QuickNavHostContext";
import "@app/components/shared/quickNav/QuickNavRailAccount.css";

export interface QuickNavRailAccountProps {
  onOpenSettings: () => void;
  /** Null between apps; the disc still renders, so the bar keeps its shape. */
  identity: QuickNavIdentity | null;
  /** Drawn as the current destination while the settings page is open. */
  active?: boolean;
}

/** The avatar is the way to your own account; the gear beside it is everything else. */
export function QuickNavRailAccount({
  onOpenSettings,
  identity,
  active = false,
}: QuickNavRailAccountProps) {
  const { t } = useTranslation();
  const displayName =
    identity?.displayName ?? t("auth.displayName.user", "User");
  const profilePictureUrl = identity?.profilePictureUrl ?? null;
  const label = `${displayName} — ${t("quickNav.account", "Account")}`;

  return (
    <div className="quick-nav-rail-account" data-active={active || undefined}>
      <Tooltip content={label} position="right" arrow>
        {/* A span, not the Avatar: Tooltip binds by cloning its child. */}
        <span
          className="quick-nav-rail-avatar-target"
          data-testid="config-button"
          data-tour="config-button"
        >
          <Avatar
            src={profilePictureUrl ?? undefined}
            name={displayName}
            size="sm"
            onClick={onOpenSettings}
            ariaLabel={label}
            ariaCurrent={active ? "page" : undefined}
            className="quick-nav-rail-avatar"
          />
        </span>
      </Tooltip>
    </div>
  );
}

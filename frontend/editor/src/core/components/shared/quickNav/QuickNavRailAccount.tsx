import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { Avatar } from "@app/ui/Avatar";
import type { QuickNavIdentity } from "@app/contexts/QuickNavHostContext";
import "@app/components/shared/quickNav/QuickNavRailAccount.css";

export interface QuickNavRailAccountProps {
  onOpenSettings: () => void;
  /** Null between apps; the disc still renders, so the bar keeps its shape. */
  identity: QuickNavIdentity | null;
}

/** The avatar opens settings, so there is no separate gear beside it. */
export function QuickNavRailAccount({
  onOpenSettings,
  identity,
}: QuickNavRailAccountProps) {
  const { t } = useTranslation();
  const displayName =
    identity?.displayName ?? t("auth.displayName.user", "User");
  const profilePictureUrl = identity?.profilePictureUrl ?? null;
  const label = `${displayName} — ${t("fileSidebar.openSettings", "Open settings")}`;

  return (
    <div className="quick-nav-rail-account">
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
            className="quick-nav-rail-avatar"
          />
        </span>
      </Tooltip>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { Avatar } from "@app/ui/Avatar";
import { useAccountIdentity } from "@app/hooks/useAccountIdentity";
import "@app/components/shared/quickNav/QuickNavRailAccount.css";

export interface QuickNavRailAccountProps {
  onOpenSettings: () => void;
}

/**
 * The account control at the bottom of the rail: the avatar itself opens
 * settings, so there is no separate gear beside it.
 *
 * Uses the shared Avatar, which owns the initials-vs-picture fallback, so the
 * rail can't drift from the identity shown in the sidebar footer or on the
 * account settings page.
 */
export function QuickNavRailAccount({
  onOpenSettings,
}: QuickNavRailAccountProps) {
  const { t } = useTranslation();
  const { displayName, profilePictureUrl } = useAccountIdentity();
  const label = `${displayName} — ${t("fileSidebar.openSettings", "Open settings")}`;

  return (
    <div className="quick-nav-rail-account">
      <Tooltip
        label={label}
        position="right"
        withinPortal
        events={{ hover: true, focus: true, touch: true }}
      >
        <Avatar
          src={profilePictureUrl ?? undefined}
          name={displayName}
          size="sm"
          onClick={onOpenSettings}
          ariaLabel={label}
          className="quick-nav-rail-avatar"
        />
      </Tooltip>
    </div>
  );
}

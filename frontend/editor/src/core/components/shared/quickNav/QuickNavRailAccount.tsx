import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { Avatar } from "@app/ui/Avatar";
import type { QuickNavIdentity } from "@app/contexts/QuickNavHostContext";
import "@app/components/shared/quickNav/QuickNavRailAccount.css";

export interface QuickNavRailAccountProps {
  onOpenSettings: () => void;
  /**
   * Null before any app has registered - during an app switch, or on a route
   * with no app around it. The disc still renders, so the bar keeps its shape.
   */
  identity: QuickNavIdentity | null;
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
  identity,
}: QuickNavRailAccountProps) {
  const { t } = useTranslation();
  const displayName = identity?.displayName ?? t("auth.displayName.user", "User");
  const profilePictureUrl = identity?.profilePictureUrl ?? null;
  const label = `${displayName} — ${t("fileSidebar.openSettings", "Open settings")}`;

  return (
    <div className="quick-nav-rail-account">
      <Tooltip content={label} position="right" arrow>
        {/* Tooltip clones its child to attach the hover/focus handlers and its
            floating reference, so the child has to accept them. Avatar takes a
            fixed prop set and spreads nothing, so handed the Avatar directly the
            tooltip silently never opened - this span is what Tooltip binds to. */}
        {/* Carries the config-button hooks because this rail, not the sidebar
            footer, is the account control wherever it renders: the admin
            onboarding tour anchors a step to data-tour, and the end-to-end suites
            click data-testid. On the wrapper rather than the Avatar, which takes
            a fixed prop set - a click lands on the button filling it. */}
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

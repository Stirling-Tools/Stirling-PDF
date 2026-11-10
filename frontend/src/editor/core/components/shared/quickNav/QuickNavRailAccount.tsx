import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { Avatar } from "@editor/ui/Avatar";
import type { QuickNavIdentity } from "@editor/contexts/QuickNavHostContext";
import "@editor/components/shared/quickNav/QuickNavRailAccount.css";
import { PrivateContent } from "@editor/components/shared/PrivateContent";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

export interface QuickNavRailAccountProps {
  onOpen: () => void;
  /** Null until an identity is first resolved, or when explicitly cleared. */
  identity: QuickNavIdentity | null;
  /** Drawn as the current destination while the settings page is open. */
  active?: boolean;
}

/** The avatar is the only way into settings, and lands on your own account. */
export function QuickNavRailAccount({
  onOpen,
  identity,
  active = false,
}: QuickNavRailAccountProps) {
  const { t } = useTranslation();
  const guest = identity?.isGuest === true;
  const displayName = guest
    ? t("guestAccess.signIn", "Sign in as administrator")
    : (identity?.displayName ?? t("auth.displayName.user", "User"));
  const profilePictureUrl = identity?.profilePictureUrl ?? null;
  const label = guest
    ? `${displayName} — ${t("guestAccess.guestHint", "Opens the sign-in page")}`
    : `${displayName} — ${t("quickNav.account", "Account")}`;

  return (
    <div className="quick-nav-rail-account" data-active={active || undefined}>
      <Tooltip
        content={<PrivateContent>{label}</PrivateContent>}
        position="right"
        arrow
      >
        {/* A span, not the Avatar: Tooltip binds by cloning its child. */}
        <span
          className="quick-nav-rail-avatar-target"
          data-testid="config-button"
          data-tour="config-button"
        >
          {guest ? (
            // No face to draw and no name to initial: a plain button, with the
            // same box and focus ring as the avatar it replaces.
            <button
              type="button"
              className="quick-nav-rail-guest"
              onClick={onOpen}
              aria-label={label}
            >
              <Icon name="log-in" size="1rem" />
            </button>
          ) : (
            <Avatar
              src={profilePictureUrl ?? undefined}
              name={displayName}
              size="sm"
              onClick={onOpen}
              ariaLabel={label}
              ariaCurrent={active ? "page" : undefined}
              className={`quick-nav-rail-avatar ${privateContentClassName}`}
            />
          )}
        </span>
      </Tooltip>
    </div>
  );
}

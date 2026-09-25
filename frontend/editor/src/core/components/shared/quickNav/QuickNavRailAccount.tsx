import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { Avatar } from "@app/ui/Avatar";
import { Dropdown } from "@app/ui/Dropdown";
import { Icon } from "@app/ui/Icon";
import type {
  QuickNavAccountMenu,
  QuickNavIdentity,
} from "@app/contexts/QuickNavHostContext";
import "@app/components/shared/quickNav/QuickNavRailAccount.css";

const ICON_SIZE = "1rem";

export interface QuickNavRailAccountProps {
  /** Opens the settings page on its first section. */
  onOpenSettings: () => void;
  /** Navigates to one of the menu's shortcut targets. */
  onOpenShortcut: (to: string) => void;
  /** Called each time the menu opens; absent means settings is the only entry. */
  resolveMenu?: () => QuickNavAccountMenu | undefined;
  /** Null until an identity is first resolved, or when explicitly cleared. */
  identity: QuickNavIdentity | null;
  /** Drawn as the current destination while the settings page is open. */
  active?: boolean;
}

/** The avatar opens a short menu of the settings people reach for most, plus sign out. */
export function QuickNavRailAccount({
  onOpenSettings,
  onOpenShortcut,
  resolveMenu,
  identity,
  active = false,
}: QuickNavRailAccountProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const displayName =
    identity?.displayName ?? t("auth.displayName.user", "User");
  const profilePictureUrl = identity?.profilePictureUrl ?? undefined;
  const label = `${displayName} - ${t("quickNav.account", "Account")}`;
  const menu = open ? resolveMenu?.() : undefined;

  return (
    <div className="quick-nav-rail-account" data-active={active || undefined}>
      <Dropdown.Root open={open} onOpenChange={setOpen} side="right">
        <Tooltip content={label} position="right" arrow disabled={open}>
          {/* A span, not the button: Tooltip binds by cloning its child. */}
          <span
            className="quick-nav-rail-avatar-target"
            data-testid="config-button"
            data-tour="config-button"
          >
            <Dropdown.Trigger>
              <button
                type="button"
                className="quick-nav-rail-avatar"
                aria-label={label}
                aria-current={active ? "page" : undefined}
              >
                {/* Decorative: the button's own label already names the account. */}
                <span aria-hidden className="quick-nav-rail-avatar__disc">
                  <Avatar
                    src={profilePictureUrl}
                    name={displayName}
                    size="sm"
                  />
                </span>
              </button>
            </Dropdown.Trigger>
          </span>
        </Tooltip>
        <Dropdown.Menu className="quick-nav-account-menu" width="14rem">
          <div className="quick-nav-account-menu__header">
            <span aria-hidden>
              <Avatar src={profilePictureUrl} name={displayName} size="md" />
            </span>
            <span className="quick-nav-account-menu__name">{displayName}</span>
          </div>
          <Dropdown.Divider />
          {menu?.shortcuts.map((shortcut) => (
            <Dropdown.Item
              key={shortcut.id}
              leading={<Icon name={shortcut.icon} size={ICON_SIZE} />}
              onSelect={() => onOpenShortcut(shortcut.to)}
            >
              {shortcut.label}
            </Dropdown.Item>
          ))}
          <Dropdown.Item
            leading={<Icon name="settings" size={ICON_SIZE} />}
            onSelect={onOpenSettings}
          >
            {t("quickNav.accountMenu.allSettings", "All settings")}
          </Dropdown.Item>
          {menu?.signOut && (
            <>
              <Dropdown.Divider />
              <Dropdown.Item
                className="quick-nav-account-menu__sign-out"
                leading={<Icon name="log-out" size={ICON_SIZE} />}
                onSelect={menu.signOut}
              >
                {t("settings.general.logout", "Log out")}
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Menu>
      </Dropdown.Root>
    </div>
  );
}

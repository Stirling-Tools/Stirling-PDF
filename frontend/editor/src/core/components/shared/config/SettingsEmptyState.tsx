import type { ReactNode } from "react";
import { Icon, type IconName } from "@app/ui/Icon";
import "@app/components/shared/config/SettingsEmptyState.css";

export interface SettingsEmptyStateProps {
  title: ReactNode;
  children: ReactNode;
  /** Defaults to an outline box; pass one that suits the section. */
  icon?: IconName;
}

/**
 * Nothing to show yet. Deliberately not a warning: an empty audit log or an
 * unused endpoint list is the normal state of a fresh install.
 */
export function SettingsEmptyState({
  title,
  children,
  icon = "inbox",
}: SettingsEmptyStateProps) {
  return (
    <div className="settings-empty">
      <Icon name={icon} size={28} className="settings-empty__icon" />
      <p className="settings-empty__title">{title}</p>
      <p className="settings-empty__body">{children}</p>
    </div>
  );
}

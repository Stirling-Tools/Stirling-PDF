import type { ReactNode } from "react";
import LocalIcon from "@app/components/shared/LocalIcon";
import "@app/components/shared/config/SettingsEmptyState.css";

export interface SettingsEmptyStateProps {
  title: ReactNode;
  children: ReactNode;
  /** Defaults to an outline box; pass one that suits the section. */
  icon?: string;
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
      <LocalIcon
        icon={icon}
        width={28}
        height={28}
        className="settings-empty__icon"
      />
      <p className="settings-empty__title">{title}</p>
      <p className="settings-empty__body">{children}</p>
    </div>
  );
}

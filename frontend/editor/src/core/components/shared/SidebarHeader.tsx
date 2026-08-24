import { AppSwitcher } from "@app/components/shared/AppSwitcher";
import { SidebarToggleButton } from "@app/components/shared/SidebarToggleButton";

export interface SidebarHeaderProps {
  /** Icon-rail state: the lockup drops its wordmark for the bare brand mark. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Accessible name override for the toggle (e.g. "Leave My Files"). */
  toggleAriaLabel?: string;
  /** Icon override for the toggle (e.g. a back arrow on /files). */
  toggleIcon?: React.ReactNode;
  className?: string;
}

/**
 * Top row of the sidebar: the brand lockup, with the collapse toggle at the
 * trailing edge.
 */
export function SidebarHeader({
  collapsed,
  onToggleCollapse,
  toggleAriaLabel,
  toggleIcon,
  className,
}: SidebarHeaderProps) {
  return (
    <div className={`file-sidebar-header${className ? ` ${className}` : ""}`}>
      <AppSwitcher collapsed={collapsed} />
      {onToggleCollapse && (
        <SidebarToggleButton
          collapsed={collapsed}
          onToggle={onToggleCollapse}
          ariaLabel={toggleAriaLabel}
          icon={toggleIcon}
        />
      )}
    </div>
  );
}

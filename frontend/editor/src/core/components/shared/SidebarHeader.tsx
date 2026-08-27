import { Logo } from "@app/ui/Logo";
import { SidebarToggleButton } from "@app/components/shared/SidebarToggleButton";

export interface SidebarHeaderProps {
  /** Collapsed drops the wordmark. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  toggleAriaLabel?: string;
  toggleIcon?: React.ReactNode;
  className?: string;
}

/**
 * The wordmark plus the collapse toggle. The mark itself is at the top of the rail
 * beside it, so the brand reads across the two columns as one lockup.
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
      {!collapsed && <Logo variant="textOnly" textHeight="1.3rem" />}
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

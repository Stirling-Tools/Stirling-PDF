import { Logo } from "@app/ui/Logo";
import { SidebarToggleButton } from "@app/components/shared/SidebarToggleButton";

export interface SidebarHeaderProps {
  /** Icon-rail state: too narrow for the wordmark, which is dropped. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Accessible name override for the toggle (e.g. "Leave My Files"). */
  toggleAriaLabel?: string;
  /** Icon override for the toggle (e.g. a back arrow on /files). */
  toggleIcon?: React.ReactNode;
  className?: string;
}

/**
 * Top row of the sidebar: the "Stirling" wordmark, with the collapse toggle at
 * the trailing edge.
 *
 * The mark itself lives at the top of the quick nav rail, in the leftmost
 * column, so the brand reads across the two as one lockup. Collapsed, this row
 * is the toggle alone - the mark is still on screen beside it.
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

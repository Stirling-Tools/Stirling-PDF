import { Logo } from "@app/ui/Logo";
import { SidebarToggleButton } from "@app/components/shared/SidebarToggleButton";

export interface SidebarHeaderProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

/** The wordmark and the collapse toggle; the brand mark sits in the rail beside it. */
export function SidebarHeader({
  collapsed,
  onToggleCollapse,
  className,
}: SidebarHeaderProps) {
  return (
    <div className={`file-sidebar-header${className ? ` ${className}` : ""}`}>
      {!collapsed && <Logo variant="textOnly" textHeight="1.3rem" />}
      {onToggleCollapse && (
        <SidebarToggleButton
          collapsed={collapsed}
          onToggle={onToggleCollapse}
        />
      )}
    </div>
  );
}

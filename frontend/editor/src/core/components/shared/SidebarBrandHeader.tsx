import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { AppSwitcher } from "@app/components/shared/AppSwitcher";
import { SidebarToggleIcon } from "@app/components/shared/SidebarToggleIcon";

export interface SidebarBrandHeaderProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Accessible name override for the toggle button. */
  toggleAriaLabel?: string;
  /** Icon override for the toggle button (e.g. back-arrow on /files). */
  toggleIcon?: React.ReactNode;
  className?: string;
}

/**
 * Brand lockup (logo, doubling as the editor⇄processor switcher) plus the
 * sidebar collapse toggle.
 *
 * Extracted so it can be rendered ABOVE the workspace's left column rather than
 * inside the file sidebar: that lets the logo occupy the true top-left corner,
 * with the quick nav rail starting beneath it, instead of the rail pushing the
 * logo inward.
 */
export function SidebarBrandHeader({
  collapsed,
  onToggleCollapse,
  toggleAriaLabel,
  toggleIcon,
  className,
}: SidebarBrandHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className={`file-sidebar-brand${className ? ` ${className}` : ""}`}>
      <AppSwitcher collapsed={collapsed} />
      {onToggleCollapse && (
        <ActionIcon
          variant="tertiary"
          size="md"
          className="file-sidebar-collapse-toggle"
          onClick={() => onToggleCollapse()}
          aria-label={
            toggleAriaLabel ??
            (collapsed
              ? t("fileSidebar.expand", "Expand sidebar")
              : t("fileSidebar.collapse", "Collapse sidebar"))
          }
        >
          {toggleIcon ?? <SidebarToggleIcon size={18} />}
        </ActionIcon>
      )}
    </div>
  );
}

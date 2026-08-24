import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { SidebarToggleIcon } from "@app/components/shared/SidebarToggleIcon";

export interface SidebarHeaderProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Accessible name override for the toggle button. */
  toggleAriaLabel?: string;
  /** Icon override for the toggle button (e.g. back-arrow on /files). */
  toggleIcon?: React.ReactNode;
  className?: string;
}

/**
 * Top row of the sidebar, holding the collapse toggle.
 *
 * The toggle needs a home of its own because the sidebar reaches the top of the
 * window: there is no brand row above it to sit in. On /files the caller swaps
 * the icon for a back arrow, which is how you leave that view.
 */
export function SidebarHeader({
  collapsed,
  onToggleCollapse,
  toggleAriaLabel,
  toggleIcon,
  className,
}: SidebarHeaderProps) {
  const { t } = useTranslation();
  if (!onToggleCollapse) return null;
  return (
    <div className={`file-sidebar-header${className ? ` ${className}` : ""}`}>
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
    </div>
  );
}

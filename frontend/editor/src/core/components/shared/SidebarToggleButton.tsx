import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { SidebarToggleIcon } from "@app/components/shared/SidebarToggleIcon";

export interface SidebarToggleButtonProps {
  collapsed?: boolean;
  onToggle: () => void;
  /** Accessible name override (e.g. "Leave My Files" on /files). */
  ariaLabel?: string;
  /** Icon override (e.g. a back arrow on /files). */
  icon?: React.ReactNode;
}

/**
 * Opens and closes the sidebar beside it. Lives at the top of the quick nav
 * rail, above the navigation groups, so it stays in one place whether the
 * sidebar is open or collapsed.
 *
 * On /files the caller swaps in a back arrow: the sidebar is forced collapsed
 * there, so leaving the view is the only thing this can usefully do.
 */
export function SidebarToggleButton({
  collapsed,
  onToggle,
  ariaLabel,
  icon,
}: SidebarToggleButtonProps) {
  const { t } = useTranslation();
  return (
    <ActionIcon
      variant="tertiary"
      size="md"
      className="file-sidebar-collapse-toggle"
      onClick={() => onToggle()}
      aria-label={
        ariaLabel ??
        (collapsed
          ? t("fileSidebar.expand", "Expand sidebar")
          : t("fileSidebar.collapse", "Collapse sidebar"))
      }
    >
      {icon ?? <SidebarToggleIcon size={18} />}
    </ActionIcon>
  );
}

import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { SidebarToggleIcon } from "@app/components/shared/SidebarToggleIcon";

export interface SidebarToggleButtonProps {
  collapsed?: boolean;
  onToggle: () => void;
  ariaLabel?: string;
  icon?: React.ReactNode;
}

/** Opens and closes the sidebar; on /files the caller swaps in a back arrow. */
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

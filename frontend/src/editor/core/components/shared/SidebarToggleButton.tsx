import { useTranslation } from "react-i18next";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { SidebarToggleIcon } from "@editor/components/shared/SidebarToggleIcon";

export interface SidebarToggleButtonProps {
  collapsed?: boolean;
  onToggle: () => void;
}

/** Opens and closes the sidebar. */
export function SidebarToggleButton({
  collapsed,
  onToggle,
}: SidebarToggleButtonProps) {
  const { t } = useTranslation();
  return (
    <ActionIcon
      variant="tertiary"
      size="md"
      className="file-sidebar-collapse-toggle"
      onClick={() => onToggle()}
      aria-label={
        collapsed
          ? t("fileSidebar.expand", "Expand sidebar")
          : t("fileSidebar.collapse", "Collapse sidebar")
      }
    >
      <SidebarToggleIcon size={18} />
    </ActionIcon>
  );
}

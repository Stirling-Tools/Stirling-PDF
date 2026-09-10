import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { SidebarToggleIcon } from "@app/components/shared/SidebarToggleIcon";
import { renderWithTooltip } from "@app/components/shared/workbenchBar/workbenchBarTooltip";

export interface WorkbenchBarFileMenuToggleProps {
  onExpand: () => void;
}

/** Stands in for the file menu's own collapse toggle, which is hidden with it. */
export default function WorkbenchBarFileMenuToggle({
  onExpand,
}: WorkbenchBarFileMenuToggleProps) {
  const { t } = useTranslation();
  const label = t("fileSidebar.expand", "Expand sidebar");
  return renderWithTooltip(
    <ActionIcon
      variant="tertiary"
      className="workbench-bar-action-icon"
      onClick={onExpand}
      aria-label={label}
      data-testid="file-sidebar-expand"
    >
      <SidebarToggleIcon size={16} />
    </ActionIcon>,
    label,
  );
}

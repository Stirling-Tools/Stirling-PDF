import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PrintIcon from "@mui/icons-material/Print";
import { ActionIcon } from "@app/ui/ActionIcon";
import LocalIcon from "@app/components/shared/LocalIcon";
import { WorkbenchBarActionsProps } from "@app/components/shared/workbenchBar/types";

/**
 * Mobile version of the workbench bar's global actions: the icon row won't fit
 * on a phone, so print / export / save-as / close collapse into one overflow menu.
 */
export default function WorkbenchBarMobileActions({
  currentView,
  isCustomView,
  actionsDisabled,
  policyEnforcing,
  downloadLabel,
  downloadIconName,
  saveAsIconName,
  onPrint,
  onExport,
  onClose,
}: WorkbenchBarActionsProps) {
  const { t } = useTranslation();
  const exportDisabled = actionsDisabled || policyEnforcing;

  return (
    <Menu shadow="md" width={230} position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="tertiary"
          hover={false}
          className="workbench-bar-action-icon"
          aria-label={t("workbenchBar.moreActions", "More actions")}
        >
          <MoreVertIcon sx={{ fontSize: "1.25rem" }} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {currentView === "viewer" && (
          <Menu.Item
            leftSection={<PrintIcon sx={{ fontSize: "1.1rem" }} />}
            disabled={exportDisabled}
            onClick={onPrint}
          >
            {t("workbenchBar.print", "Print PDF")}
          </Menu.Item>
        )}
        {!isCustomView && (
          <Menu.Item
            leftSection={
              <LocalIcon
                icon={downloadIconName}
                width="1.1rem"
                height="1.1rem"
              />
            }
            disabled={exportDisabled}
            onClick={() => void onExport()}
          >
            {downloadLabel}
          </Menu.Item>
        )}
        {!isCustomView && saveAsIconName && (
          <Menu.Item
            leftSection={
              <LocalIcon icon={saveAsIconName} width="1.1rem" height="1.1rem" />
            }
            disabled={exportDisabled}
            onClick={() => void onExport(true)}
          >
            {t("workbenchBar.saveAs", "Save As")}
          </Menu.Item>
        )}
        {!isCustomView && (
          <>
            <Menu.Divider />
            <Menu.Item
              leftSection={<CloseIcon sx={{ fontSize: "1.1rem" }} />}
              disabled={actionsDisabled}
              onClick={() => void onClose()}
            >
              {currentView === "fileEditor"
                ? t("workbenchBar.closeAll", "Close All")
                : t("workbenchBar.closePdf", "Close PDF")}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

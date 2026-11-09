import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { WorkbenchBarActionsProps } from "@editor/components/shared/workbenchBar/types";
import "@editor/components/shared/SaveMenu.css";

/**
 * Mobile version of the workbench bar's global actions: the icon row won't fit
 * on a phone, so print / export / save-as / close collapse into one overflow menu.
 */
export default function WorkbenchBarMobileActions({
  currentView,
  showsFileActions,
  actionsDisabled,
  policyEnforcing,
  downloadLabel,
  downloadIconName,
  saveAsIconName,
  downloadUnsaved,
  saveMenu,
  onPrint,
  printDisabledReason,
  onExport,
  onClose,
}: WorkbenchBarActionsProps) {
  const { t } = useTranslation();
  const exportDisabled = actionsDisabled || policyEnforcing;
  const showPrint = currentView === "viewer";
  const showFileActions = showsFileActions;

  // Custom workbench views own their content, so none of these apply. The
  // desktop cluster renders nothing at all in that case; without this the
  // trigger would still be there, opening an empty dropdown.
  if (!showPrint && !showFileActions) return null;

  return (
    <Menu shadow="md" position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="tertiary"
          hover={false}
          className="workbench-bar-action-icon"
          aria-label={t("workbenchBar.moreActions", "More actions")}
        >
          <span className="workbench-bar-unsaved-anchor">
            <Icon name="ellipsis-vertical" size={"1.25rem"} />
            {showFileActions && downloadUnsaved && (
              <span className="workbench-bar-unsaved-dot" />
            )}
          </span>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown className="save-menu">
        {showPrint && (
          <Menu.Item
            leftSection={<Icon name="printer" size={"1.1rem"} />}
            disabled={exportDisabled || !onPrint}
            onClick={onPrint}
            title={printDisabledReason}
          >
            {t("workbenchBar.print", "Print PDF")}
          </Menu.Item>
        )}
        {showFileActions && (
          <Menu.Item
            leftSection={<Icon name={downloadIconName} size="1.1rem" />}
            rightSection={
              downloadUnsaved && (
                <span className="workbench-bar-menu-unsaved-dot" />
              )
            }
            disabled={exportDisabled}
            onClick={() => void onExport()}
          >
            <span className="save-menu__text">{downloadLabel}</span>
          </Menu.Item>
        )}
        {showFileActions &&
          saveMenu?.map((item) => (
            <Menu.Item
              key={item.key}
              leftSection={<Icon name={item.icon} size="1.1rem" />}
              disabled={exportDisabled}
              onClick={item.onClick}
            >
              <span className="save-menu__text">{item.label}</span>
            </Menu.Item>
          ))}
        {showFileActions && !saveMenu && saveAsIconName && (
          <Menu.Item
            leftSection={<Icon name={saveAsIconName} size="1.1rem" />}
            disabled={exportDisabled}
            onClick={() => void onExport(true)}
          >
            {t("workbenchBar.saveAs", "Save As")}
          </Menu.Item>
        )}
        {showFileActions && (
          <>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Icon name="x" size={"1.1rem"} />}
              disabled={actionsDisabled}
              onClick={() => void onClose()}
            >
              {currentView === "fileEditor" || currentView === "pageEditor"
                ? t("workbenchBar.closeAll", "Close All")
                : t("workbenchBar.closePdf", "Close PDF")}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

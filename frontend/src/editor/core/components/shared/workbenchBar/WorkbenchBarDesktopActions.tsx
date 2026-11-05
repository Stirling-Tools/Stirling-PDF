import React, { useState } from "react";
import { Menu } from "@mantine/core";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { ActionIcon } from "@editor/ui/ActionIcon";
import {
  PolicyEnforcingTooltip,
  renderWithTooltip,
} from "@editor/components/shared/workbenchBar/workbenchBarTooltip";
import { WorkbenchBarActionsProps } from "@editor/components/shared/workbenchBar/types";

interface WorkbenchBarDesktopActionsProps extends WorkbenchBarActionsProps {
  /** Percentage through the enforcing policy run, when it reports steps. */
  enforcingProgress?: number;
}

/**
 * Desktop version of the workbench bar's global actions: print / export /
 * save-as sit as icons, with close split off behind a separator.
 */
export default function WorkbenchBarDesktopActions({
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
  downloadDisabledReason,
  onExport,
  onClose,
  enforcingProgress,
}: WorkbenchBarDesktopActionsProps) {
  const { t } = useTranslation();
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const exportDisabled = actionsDisabled || policyEnforcing;
  const closeLabel =
    currentView === "fileEditor" || currentView === "pageEditor"
      ? t("workbenchBar.closeAll", "Close All")
      : t("workbenchBar.closePdf", "Close PDF");

  // Policy enforcement replaces the plain label with a "why is this blocked" card.
  const tooltipFor = (label: string): React.ReactNode =>
    policyEnforcing ? (
      <PolicyEnforcingTooltip action={label} progress={enforcingProgress} />
    ) : (
      label
    );

  return (
    <>
      {currentView === "viewer" &&
        renderWithTooltip(
          <ActionIcon
            variant="tertiary"
            hover={false}
            className="workbench-bar-action-icon"
            onClick={onPrint}
            disabled={exportDisabled || !onPrint}
            aria-label={t("workbenchBar.print", "Print PDF")}
          >
            <Icon name="printer" size={"1rem"} />
          </ActionIcon>,
          tooltipFor(
            printDisabledReason ?? t("workbenchBar.print", "Print PDF"),
          ),
        )}

      {/* Saving, and closing what was saved: only where a document is open. */}
      {showsFileActions && (
        // With a menu, Save and its arrow read as one control.
        <div
          className={
            saveMenu ? "workbench-bar-save-group" : "workbench-bar-save-plain"
          }
          role={saveMenu ? "group" : undefined}
          aria-label={saveMenu ? downloadLabel : undefined}
        >
          {renderWithTooltip(
            <ActionIcon
              variant="tertiary"
              hover={false}
              className="workbench-bar-action-icon"
              onClick={() => onExport()}
              disabled={exportDisabled || Boolean(downloadDisabledReason)}
              aria-label={downloadLabel}
            >
              <Icon name={downloadIconName} size="1rem" />
              {downloadUnsaved && (
                <span className="workbench-bar-unsaved-dot" />
              )}
            </ActionIcon>,
            tooltipFor(downloadDisabledReason ?? downloadLabel),
          )}
          {saveMenu && (
            <Tooltip
              content={tooltipFor(t("saveFile.menu.more", "More save options"))}
              position="bottom"
              offset={6}
              arrow
              // Over the open menu it would cover the first items.
              disabled={saveMenuOpen}
              portalTarget={document.body}
            >
              <div className="workbench-bar-tooltip-wrapper workbench-bar-save-group-caret">
                <Menu
                  shadow="md"
                  width={270}
                  position="bottom-end"
                  opened={saveMenuOpen}
                  onChange={setSaveMenuOpen}
                >
                  <Menu.Target>
                    <ActionIcon
                      variant="tertiary"
                      hover={false}
                      className="workbench-bar-action-icon"
                      disabled={
                        exportDisabled || Boolean(downloadDisabledReason)
                      }
                      aria-label={t("saveFile.menu.more", "More save options")}
                    >
                      <Icon name="chevron-down" size="1rem" />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {saveMenu.map((item) => (
                      <Menu.Item
                        key={item.key}
                        leftSection={<Icon name={item.icon} size="1rem" />}
                        onClick={item.onClick}
                      >
                        {item.label}
                        {item.description && (
                          <div className="workbench-bar-menu-hint">
                            {item.description}
                          </div>
                        )}
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              </div>
            </Tooltip>
          )}
        </div>
      )}

      {showsFileActions &&
        !saveMenu &&
        saveAsIconName &&
        renderWithTooltip(
          <ActionIcon
            variant="tertiary"
            hover={false}
            className="workbench-bar-action-icon"
            onClick={() => onExport(true)}
            disabled={exportDisabled || Boolean(downloadDisabledReason)}
            aria-label={t("workbenchBar.saveAs", "Save As")}
          >
            <Icon name={saveAsIconName} size="1rem" />
          </ActionIcon>,
          tooltipFor(
            downloadDisabledReason ?? t("workbenchBar.saveAs", "Save As"),
          ),
        )}

      {/* Separator: export group | close */}
      {showsFileActions && (
        <div className="workbench-bar-divider workbench-bar-globals-sep" />
      )}

      {/* Close (context-aware: close all / close viewer file / close page editor) */}
      {showsFileActions &&
        renderWithTooltip(
          <ActionIcon
            variant="tertiary"
            hover={false}
            className="workbench-bar-action-icon"
            onClick={onClose}
            disabled={actionsDisabled}
            aria-label={closeLabel}
          >
            <Icon name="x" size={"1rem"} />
          </ActionIcon>,
          closeLabel,
        )}
    </>
  );
}

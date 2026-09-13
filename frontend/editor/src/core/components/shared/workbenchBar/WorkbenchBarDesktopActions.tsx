import React from "react";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import { ActionIcon } from "@app/ui/ActionIcon";
import LocalIcon from "@app/components/shared/LocalIcon";
import {
  PolicyEnforcingTooltip,
  renderWithTooltip,
} from "@app/components/shared/workbenchBar/workbenchBarTooltip";
import { WorkbenchBarActionsProps } from "@app/components/shared/workbenchBar/types";

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
  isCustomView,
  actionsDisabled,
  policyEnforcing,
  downloadLabel,
  downloadIconName,
  saveAsIconName,
  onPrint,
  onExport,
  onClose,
  enforcingProgress,
}: WorkbenchBarDesktopActionsProps) {
  const { t } = useTranslation();
  const exportDisabled = actionsDisabled || policyEnforcing;
  const closeLabel =
    currentView === "fileEditor"
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
            disabled={exportDisabled}
            aria-label={t("workbenchBar.print", "Print PDF")}
          >
            <PrintIcon sx={{ fontSize: "1rem" }} />
          </ActionIcon>,
          tooltipFor(t("workbenchBar.print", "Print PDF")),
        )}

      {/* Download (file-level action — not relevant in custom views) */}
      {!isCustomView &&
        renderWithTooltip(
          <ActionIcon
            variant="tertiary"
            hover={false}
            className="workbench-bar-action-icon"
            onClick={() => onExport()}
            disabled={exportDisabled}
            aria-label={downloadLabel}
          >
            <LocalIcon icon={downloadIconName} width="1rem" height="1rem" />
          </ActionIcon>,
          tooltipFor(downloadLabel),
        )}

      {!isCustomView &&
        saveAsIconName &&
        renderWithTooltip(
          <ActionIcon
            variant="tertiary"
            hover={false}
            className="workbench-bar-action-icon"
            onClick={() => onExport(true)}
            disabled={exportDisabled}
            aria-label={t("workbenchBar.saveAs", "Save As")}
          >
            <LocalIcon icon={saveAsIconName} width="1rem" height="1rem" />
          </ActionIcon>,
          tooltipFor(t("workbenchBar.saveAs", "Save As")),
        )}

      {/* Separator: export group | close */}
      {!isCustomView && (
        <div className="workbench-bar-divider workbench-bar-globals-sep" />
      )}

      {/* Close (context-aware: close all / close viewer file / close page editor) */}
      {!isCustomView &&
        renderWithTooltip(
          <ActionIcon
            variant="tertiary"
            hover={false}
            className="workbench-bar-action-icon"
            onClick={onClose}
            disabled={actionsDisabled}
            aria-label={closeLabel}
          >
            <CloseIcon sx={{ fontSize: "1rem" }} />
          </ActionIcon>,
          closeLabel,
        )}
    </>
  );
}

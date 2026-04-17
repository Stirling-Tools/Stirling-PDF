import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { ActionIcon } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useRightRail } from "@app/contexts/RightRailContext";
import { useFileState, useFileSelection, useFileActions } from "@app/contexts/FileContext";
import { isStirlingFile } from "@app/types/fileContext";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { ViewerContext, useViewer } from "@app/contexts/ViewerContext";
import { WorkbenchType } from "@app/types/workbench";
import { Tooltip } from "@app/components/shared/Tooltip";
import LocalIcon from "@app/components/shared/LocalIcon";
import { downloadFile } from "@app/services/downloadService";
import { RightRailButtonConfig, RightRailRenderContext, RightRailSection } from "@app/types/rightRail";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FolderIcon from "@mui/icons-material/Folder";
import ShareIcon from "@mui/icons-material/Share";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import "@app/components/shared/WorkbenchBar.css";

const SECTION_ORDER: RightRailSection[] = ["top", "middle", "bottom"];

interface ViewOption {
  value: WorkbenchType;
  label: string;
  icon: React.ReactNode;
}

interface WorkbenchBarProps {
  currentView: WorkbenchType;
  setCurrentView: (view: WorkbenchType) => void;
  hasFiles: boolean;
}

function renderWithTooltip(node: React.ReactNode, tooltip: React.ReactNode | undefined) {
  if (!tooltip) return node;
  return (
    <Tooltip
      content={tooltip}
      position="bottom"
      offset={6}
      arrow
      portalTarget={typeof document !== "undefined" ? document.body : undefined}
    >
      <div className="workbench-bar-tooltip-wrapper">{node}</div>
    </Tooltip>
  );
}

export default function WorkbenchBar({ currentView, setCurrentView, hasFiles }: WorkbenchBarProps) {
  const { t } = useTranslation();
  const { buttons, actions, allButtonsDisabled } = useRightRail();
  const { pageEditorFunctions, toolPanelMode, leftPanelView } = useToolWorkflow();
  const disableForFullscreen = toolPanelMode === "fullscreen" && leftPanelView === "toolPicker";
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const viewerContext = React.useContext(ViewerContext);

  const { selectors } = useFileState();
  const { selectedFiles, selectedFileIds } = useFileSelection();
  const { actions: fileActions } = useFileActions();
  const activeFiles = selectors.getFiles();
  const { activeFileIndex } = useViewer();
  const pageEditorTotalPages = pageEditorFunctions?.totalPages ?? 0;
  const pageEditorSelectedCount = pageEditorFunctions?.selectedPageIds?.length ?? 0;

  const totalItems = useMemo(() => {
    if (currentView === "pageEditor") return pageEditorTotalPages;
    return activeFiles.length;
  }, [currentView, pageEditorTotalPages, activeFiles.length]);

  const selectedCount = useMemo(() => {
    if (currentView === "pageEditor") return pageEditorSelectedCount;
    return selectedFileIds.length;
  }, [currentView, pageEditorSelectedCount, selectedFileIds.length]);

  const sectionsWithButtons = useMemo(() => {
    return SECTION_ORDER.map((section) => {
      const sectionButtons = buttons.filter((btn) => (btn.section ?? "top") === section && (btn.visible ?? true));
      return { section, buttons: sectionButtons };
    }).filter((entry) => entry.buttons.length > 0);
  }, [buttons]);

  const handleExportAll = useCallback(
    async (forceNewFile = false) => {
      if (currentView === "viewer") {
        const buffer = await viewerContext?.exportActions?.saveAsCopy?.();
        if (!buffer) return;
        const fileToExport = selectedFiles.length > 0 ? selectedFiles[0] : activeFiles[0];
        if (!fileToExport) return;
        const stub = isStirlingFile(fileToExport) ? selectors.getStirlingFileStub(fileToExport.fileId) : undefined;
        try {
          const result = await downloadFile({
            data: new Blob([buffer], { type: "application/pdf" }),
            filename: fileToExport.name,
            localPath: forceNewFile ? undefined : stub?.localFilePath,
          });
          if (!forceNewFile && !result.cancelled && stub && result.savedPath) {
            fileActions.updateStirlingFileStub(stub.id, {
              localFilePath: stub.localFilePath ?? result.savedPath,
              isDirty: false,
            });
          }
        } catch (error) {
          console.error("[WorkbenchBar] Failed to export viewer file:", error);
        }
        return;
      }

      if (currentView === "pageEditor") {
        pageEditorFunctions?.onExportAll?.();
        return;
      }

      const filesToExport = selectedFiles.length > 0 ? selectedFiles : activeFiles;
      for (const file of filesToExport) {
        const stub = isStirlingFile(file) ? selectors.getStirlingFileStub(file.fileId) : undefined;
        try {
          const result = await downloadFile({
            data: file,
            filename: file.name,
            localPath: forceNewFile ? undefined : stub?.localFilePath,
          });
          if (result.cancelled) continue;
          if (!forceNewFile && stub && result.savedPath) {
            fileActions.updateStirlingFileStub(stub.id, {
              localFilePath: stub.localFilePath ?? result.savedPath,
              isDirty: false,
            });
          }
        } catch (error) {
          console.error("[WorkbenchBar] Failed to export file:", file.name, error);
        }
      }
    },
    [currentView, selectedFiles, activeFiles, pageEditorFunctions, viewerContext, selectors, fileActions],
  );

  const handlePrint = useCallback(() => {
    viewerContext?.printActions?.print?.();
  }, [viewerContext]);

  const handleClose = useCallback(async () => {
    if (currentView === "fileEditor") {
      await fileActions.clearAllFiles();
    } else if (currentView === "viewer") {
      const file = activeFiles[activeFileIndex] ?? activeFiles[0];
      if (file && isStirlingFile(file)) {
        await fileActions.removeFiles([file.fileId], false);
      }
      if (activeFiles.length <= 1) {
        setCurrentView("fileEditor");
      }
    } else if (currentView === "pageEditor") {
      pageEditorFunctions?.closePdf?.();
    }
  }, [currentView, fileActions, activeFiles, activeFileIndex, pageEditorFunctions, setCurrentView]);

  const handleShare = useCallback(async () => {
    const fileToShare = selectedFiles.length > 0 ? selectedFiles[0] : activeFiles[0];

    if (currentView === "viewer") {
      const buffer = await viewerContext?.exportActions?.saveAsCopy?.();
      const filename = fileToShare?.name ?? "document.pdf";
      if (buffer && navigator.canShare) {
        const pdfFile = new File([buffer], filename, { type: "application/pdf" });
        if (navigator.canShare({ files: [pdfFile] })) {
          try {
            await navigator.share({ files: [pdfFile], title: filename });
          } catch {
            // user cancelled or API unavailable
          }
        }
      }
      return;
    }

    if (fileToShare && navigator.canShare) {
      const shareFile = isStirlingFile(fileToShare)
        ? new File([fileToShare], fileToShare.name, { type: "application/pdf" })
        : fileToShare;
      if (navigator.canShare({ files: [shareFile] })) {
        try {
          await navigator.share({ files: [shareFile], title: fileToShare.name });
        } catch {
          // cancelled or not supported
        }
      }
    }
  }, [currentView, selectedFiles, activeFiles, viewerContext]);

  const downloadTooltip = useMemo(() => {
    if (currentView === "pageEditor") return t("rightRail.exportAll", "Export PDF");
    if (currentView === "viewer") return terminology.download;
    if (selectedCount > 0) return terminology.downloadSelected;
    return terminology.downloadAll;
  }, [currentView, selectedCount, t, terminology]);

  const renderButton = useCallback(
    (btn: RightRailButtonConfig) => {
      const action = actions[btn.id];
      const disabled = Boolean(btn.disabled || allButtonsDisabled || disableForFullscreen);
      const isActive = Boolean(btn.active);

      const triggerAction = () => {
        if (!disabled) action?.();
      };

      if (btn.render) {
        const context: RightRailRenderContext = {
          id: btn.id,
          disabled,
          allButtonsDisabled,
          action,
          triggerAction,
          active: isActive,
        };
        return btn.render(context) ?? null;
      }

      if (!btn.icon) return null;

      const ariaLabel = btn.ariaLabel || (typeof btn.tooltip === "string" ? (btn.tooltip as string) : undefined);
      const buttonNode = (
        <ActionIcon
          variant={isActive ? "filled" : "subtle"}
          color={isActive ? "blue" : undefined}
          radius="md"
          className="workbench-bar-action-icon"
          onClick={triggerAction}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-pressed={isActive ? true : undefined}
        >
          {btn.icon}
        </ActionIcon>
      );
      return renderWithTooltip(buttonNode, btn.tooltip);
    },
    [actions, allButtonsDisabled, disableForFullscreen],
  );

  // View options
  const viewOptions: ViewOption[] = [
    { value: "viewer", label: t("workbenchBar.viewer", "Viewer"), icon: <InsertDriveFileIcon fontSize="small" /> },
    { value: "fileEditor", label: t("workbenchBar.activeFiles", "Active Files"), icon: <FolderIcon fontSize="small" /> },
  ];

  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const measure = () => {
      const viewsEl = bar.querySelector<HTMLElement>(".workbench-bar-views");
      const globalsEl = bar.querySelector<HTMLElement>(".workbench-bar-globals");
      const centerEl = bar.querySelector<HTMLElement>(".workbench-bar-center");

      const viewsWidth = viewsEl?.offsetWidth ?? 0;
      const globalsWidth = globalsEl?.offsetWidth ?? 0;
      const centerChildren = centerEl ? (Array.from(centerEl.children) as HTMLElement[]) : [];
      const centerWidth =
        centerChildren.reduce((sum, el) => sum + el.offsetWidth, 0) + Math.max(0, centerChildren.length - 1) * 2; // gap: 2px

      const needed = viewsWidth + centerWidth + globalsWidth + 24; // 24px bar padding
      bar.dataset.wrapped = String(needed > bar.clientWidth);
    };

    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    measure();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={barRef} className="workbench-bar" data-wrapped="true" data-tour="workbench-bar">
      {/* Left: View switcher */}
      <div className="workbench-bar-views">
        {hasFiles &&
          viewOptions.map((opt) => (
            <button
              key={opt.value}
              className={`workbench-bar-view-btn${currentView === opt.value ? " active" : ""}`}
              onClick={() => setCurrentView(opt.value)}
              aria-pressed={currentView === opt.value}
              type="button"
            >
              {opt.icon}
              <span className="workbench-bar-view-label">{opt.label}</span>
            </button>
          ))}
      </div>

      {/* Tool buttons — second row, only rendered when buttons exist */}
      {sectionsWithButtons.length > 0 && (
        <div className="workbench-bar-center">
          {sectionsWithButtons.map(({ section, buttons: sectionButtons }, idx) => (
            <React.Fragment key={section}>
              {idx > 0 && <div className="workbench-bar-divider" />}
              {sectionButtons.map((btn) => {
                const content = renderButton(btn);
                if (!content) return null;
                return (
                  <div key={btn.id} className="workbench-bar-action-wrapper">
                    {content}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Right: Global buttons (share / delete / download / zoom + page nav) */}
      <div className="workbench-bar-globals">
        {/* Print */}
        {currentView === "viewer" &&
          renderWithTooltip(
            <ActionIcon
              variant="subtle"
              radius="md"
              className="workbench-bar-action-icon"
              onClick={handlePrint}
              disabled={totalItems === 0 || allButtonsDisabled || disableForFullscreen}
              aria-label={t("rightRail.print", "Print PDF")}
            >
              <PrintIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>,
            t("rightRail.print", "Print PDF"),
          )}

        {/* Share (Web Share API) */}
        {renderWithTooltip(
          <ActionIcon
            variant="subtle"
            radius="md"
            className="workbench-bar-action-icon"
            onClick={handleShare}
            disabled={totalItems === 0 || allButtonsDisabled || disableForFullscreen}
            aria-label={t("rightRail.share", "Share")}
          >
            <ShareIcon sx={{ fontSize: "1rem" }} />
          </ActionIcon>,
          t("rightRail.share", "Share"),
        )}

        {/* Close (context-aware: close all / close viewer file / close page editor) */}
        {renderWithTooltip(
          <ActionIcon
            variant="subtle"
            radius="md"
            className="workbench-bar-action-icon"
            onClick={handleClose}
            disabled={totalItems === 0 || allButtonsDisabled || disableForFullscreen}
            aria-label={
              currentView === "fileEditor" ? t("rightRail.closeAll", "Close All") : t("rightRail.closePdf", "Close PDF")
            }
          >
            <CloseIcon sx={{ fontSize: "1rem" }} />
          </ActionIcon>,
          currentView === "fileEditor" ? t("rightRail.closeAll", "Close All") : t("rightRail.closePdf", "Close PDF"),
        )}

        {/* Download */}
        {renderWithTooltip(
          <ActionIcon
            variant="subtle"
            radius="md"
            className="workbench-bar-action-icon"
            onClick={() => handleExportAll()}
            disabled={disableForFullscreen || (currentView !== "viewer" && (totalItems === 0 || allButtonsDisabled))}
          >
            <LocalIcon icon={icons.downloadIconName} width="1rem" height="1rem" />
          </ActionIcon>,
          downloadTooltip,
        )}

        {/* Save As */}
        {icons.saveAsIconName &&
          renderWithTooltip(
            <ActionIcon
              variant="subtle"
              radius="md"
              className="workbench-bar-action-icon"
              onClick={() => handleExportAll(true)}
              disabled={disableForFullscreen || (currentView !== "viewer" && (totalItems === 0 || allButtonsDisabled))}
            >
              <LocalIcon icon={icons.saveAsIconName} width="1rem" height="1rem" />
            </ActionIcon>,
            t("rightRail.saveAs", "Save As"),
          )}
      </div>
    </div>
  );
}

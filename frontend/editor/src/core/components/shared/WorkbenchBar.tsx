import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { ActionIcon } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  clearFilesPageReturnRoute,
  getFilesPageReturnRoute,
  subscribeFilesPageReturnRoute,
} from "@app/components/filesPage/filesPageReturnRoute";
import { useWorkbenchBar } from "@app/contexts/WorkbenchBarContext";
import {
  useFileState,
  useFileSelection,
  useFileActions,
} from "@app/contexts/FileContext";
import { isStirlingFile } from "@app/types/fileContext";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { ViewerContext, useViewer } from "@app/contexts/ViewerContext";
import { WorkbenchType, isBaseWorkbench } from "@app/types/workbench";
import { Tooltip } from "@app/components/shared/Tooltip";
import LocalIcon from "@app/components/shared/LocalIcon";
import ViewerShareButton from "@app/components/viewer/ViewerShareButton";
import { useSharingEnabled } from "@app/hooks/useSharingEnabled";
import { downloadFileWithPolicy as downloadFile } from "@app/services/exportWithPolicy";
import { enforceExportPolicies } from "@app/services/policyExport";
import { downloadFile as downloadRaw } from "@app/services/downloadService";
import { alert as showAlert } from "@app/components/toast";
import {
  WorkbenchBarButtonConfig,
  WorkbenchBarRenderContext,
  WorkbenchBarSection,
} from "@app/types/workbenchBar";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FolderIcon from "@mui/icons-material/Folder";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import "@app/components/shared/WorkbenchBar.css";

const SECTION_ORDER: WorkbenchBarSection[] = ["top", "middle", "bottom"];

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

function renderWithTooltip(
  node: React.ReactNode,
  tooltip: React.ReactNode | undefined,
) {
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

export default function WorkbenchBar({
  currentView,
  setCurrentView,
  hasFiles,
}: WorkbenchBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const returnRoute = useSyncExternalStore(
    subscribeFilesPageReturnRoute,
    getFilesPageReturnRoute,
    () => null,
  );
  const handleBackToFiles = useCallback(() => {
    if (!returnRoute) return;
    const target = returnRoute.route;
    clearFilesPageReturnRoute();
    navigate(target);
  }, [returnRoute, navigate]);
  const { buttons, actions, allButtonsDisabled } = useWorkbenchBar();
  const {
    pageEditorFunctions,
    toolPanelMode,
    leftPanelView,
    customWorkbenchViews,
  } = useToolWorkflow();
  const { selectedTool } = useNavigationState();
  const isCustomView = !isBaseWorkbench(currentView);
  const disableForFullscreen =
    toolPanelMode === "fullscreen" && leftPanelView === "toolPicker";
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const { sharingEnabled } = useSharingEnabled();
  const viewerContext = React.useContext(ViewerContext);

  const { selectors } = useFileState();
  const { selectedFiles, selectedFileIds } = useFileSelection();
  const { actions: fileActions } = useFileActions();
  const activeFiles = selectors.getFiles();
  const { activeFileId, setActiveFileId } = useViewer();
  const pageEditorTotalPages = pageEditorFunctions?.totalPages ?? 0;
  const pageEditorSelectedCount =
    pageEditorFunctions?.selectedPageIds?.length ?? 0;

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
      const sectionButtons = buttons.filter(
        (btn) => (btn.section ?? "top") === section && (btn.visible ?? true),
      );
      return { section, buttons: sectionButtons };
    }).filter((entry) => entry.buttons.length > 0);
  }, [buttons]);

  const handleExportAll = useCallback(
    async (forceNewFile = false) => {
      if (currentView === "viewer") {
        const buffer = await viewerContext?.exportActions?.saveAsCopy?.();
        if (!buffer) return;
        const fileToExport =
          selectedFiles.length > 0 ? selectedFiles[0] : activeFiles[0];
        if (!fileToExport) return;
        const stub = isStirlingFile(fileToExport)
          ? selectors.getStirlingFileStub(fileToExport.fileId)
          : undefined;
        try {
          const result = await downloadFile({
            data: new Blob([buffer], { type: "application/pdf" }),
            filename: fileToExport.name,
            localPath: forceNewFile ? undefined : stub?.localFilePath,
            fileId: stub?.id,
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

      const filesToExport =
        selectedFiles.length > 0 ? selectedFiles : activeFiles;
      const stubs = filesToExport.map((file) =>
        isStirlingFile(file)
          ? selectors.getStirlingFileStub(file.fileId)
          : undefined,
      );

      // Enforce all files in one batch so the toast shows progress across the
      // whole set (e.g. "report.pdf (2 of 5)") rather than N invisible solo runs.
      let enforced: File[];
      try {
        enforced = await enforceExportPolicies(
          filesToExport as File[],
          stubs.map((s) => s?.id),
        );
      } catch {
        enforced = filesToExport as File[];
        showAlert({
          alertType: "warning",
          title: t("policies.enforcement.exportFailureTitle"),
          body: t("policies.enforcement.exportFailureBody"),
        });
      }

      for (let idx = 0; idx < filesToExport.length; idx++) {
        const file = filesToExport[idx];
        const stub = stubs[idx];
        try {
          const result = await downloadRaw({
            data: enforced[idx],
            filename: file.name,
            localPath: forceNewFile ? undefined : stub?.localFilePath,
            fileId: stub?.id,
          });
          if (result.cancelled) continue;
          if (!forceNewFile && stub && result.savedPath) {
            fileActions.updateStirlingFileStub(stub.id, {
              localFilePath: stub.localFilePath ?? result.savedPath,
              isDirty: false,
            });
          }
        } catch (error) {
          console.error(
            "[WorkbenchBar] Failed to export file:",
            file.name,
            error,
          );
        }
      }
    },
    [
      currentView,
      selectedFiles,
      activeFiles,
      pageEditorFunctions,
      viewerContext,
      selectors,
      fileActions,
    ],
  );

  const handlePrint = useCallback(() => {
    viewerContext?.printActions?.print?.();
  }, [viewerContext]);

  const handleClose = useCallback(async () => {
    if (currentView === "fileEditor") {
      await fileActions.clearAllFiles();
    } else if (currentView === "viewer") {
      const file =
        (activeFileId
          ? activeFiles.find(
              (f) => isStirlingFile(f) && f.fileId === activeFileId,
            )
          : null) ?? activeFiles[0];
      const countBeforeRemove = activeFiles.length;
      if (file && isStirlingFile(file)) {
        // Pick the next file to show before removing, so the sidebar stays in sync.
        const remaining = activeFiles.filter(
          (f) => isStirlingFile(f) && f.fileId !== file.fileId,
        );
        const nextFile = remaining.find(isStirlingFile) ?? null;
        await fileActions.removeFiles([file.fileId], false);
        if (countBeforeRemove <= 1) {
          setCurrentView("fileEditor");
        } else if (nextFile) {
          setActiveFileId(nextFile.fileId);
        }
      } else if (countBeforeRemove <= 1) {
        setCurrentView("fileEditor");
      }
    } else if (currentView === "pageEditor") {
      pageEditorFunctions?.closePdf?.();
    }
  }, [
    currentView,
    fileActions,
    activeFiles,
    activeFileId,
    setActiveFileId,
    pageEditorFunctions,
    setCurrentView,
  ]);

  const downloadTooltip = useMemo(() => {
    if (currentView === "pageEditor")
      return t("workbenchBar.exportAll", "Export PDF");
    if (currentView === "viewer") return terminology.download;
    if (selectedCount > 0) return terminology.downloadSelected;
    return terminology.downloadAll;
  }, [currentView, selectedCount, t, terminology]);

  const renderButton = useCallback(
    (btn: WorkbenchBarButtonConfig) => {
      const action = actions[btn.id];
      const disabled = Boolean(
        btn.disabled || allButtonsDisabled || disableForFullscreen,
      );
      const isActive = Boolean(btn.active);

      const triggerAction = () => {
        if (!disabled) action?.();
      };

      if (btn.render) {
        const context: WorkbenchBarRenderContext = {
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

      const ariaLabel =
        btn.ariaLabel ||
        (typeof btn.tooltip === "string" ? (btn.tooltip as string) : undefined);
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
    {
      value: "viewer",
      label: t("workbenchBar.viewer", "Viewer"),
      icon: <InsertDriveFileIcon fontSize="small" />,
    },
    {
      value: "fileEditor",
      label: t("workbenchBar.activeFiles", "Active Files"),
      icon: <FolderIcon fontSize="small" />,
    },
    ...(selectedTool === "multiTool"
      ? [
          {
            value: "pageEditor" as WorkbenchType,
            label: t("workbenchBar.multiTool", "Multi-Tool"),
            icon: (
              <LocalIcon
                icon="dashboard-customize-outline-rounded"
                width="1rem"
                height="1rem"
              />
            ),
          },
        ]
      : []),
    ...customWorkbenchViews
      .filter((v) => v.data != null)
      .map((v) => ({
        value: v.workbenchId,
        label: v.label,
        icon: v.icon ?? <InsertDriveFileIcon fontSize="small" />,
      })),
  ];

  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const measure = () => {
      const viewsEl = bar.querySelector<HTMLElement>(".workbench-bar-views");
      const globalsEl = bar.querySelector<HTMLElement>(
        ".workbench-bar-globals",
      );
      const centerEl = bar.querySelector<HTMLElement>(".workbench-bar-center");

      const viewsWidth = viewsEl?.offsetWidth ?? 0;
      const globalsWidth = globalsEl?.offsetWidth ?? 0;
      const centerChildren = centerEl
        ? (Array.from(centerEl.children) as HTMLElement[])
        : [];
      const centerWidth =
        centerChildren.reduce((sum, el) => sum + el.offsetWidth, 0) +
        Math.max(0, centerChildren.length - 1) * 2; // gap: 2px

      const needed = viewsWidth + centerWidth + globalsWidth + 24; // 24px bar padding
      bar.dataset.wrapped = String(needed > bar.clientWidth);
    };

    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    measure();
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={barRef}
      className="workbench-bar"
      data-wrapped="true"
      data-tour="workbench-bar"
    >
      {/* Left: optional "Back to My Files" + view switcher */}
      <div className="workbench-bar-views" data-tour="view-switcher">
        {returnRoute && hasFiles && (
          <>
            <button
              type="button"
              className="workbench-bar-view-btn workbench-bar-back-btn"
              onClick={handleBackToFiles}
              aria-label={t(
                returnRoute.label
                  ? "filesPage.backToFolder"
                  : "filesPage.backToMyFiles",
                returnRoute.label
                  ? `Back to ${returnRoute.label}`
                  : "Back to My Files",
                { folder: returnRoute.label ?? "" },
              )}
            >
              <ArrowBackIcon style={{ fontSize: "1.1rem" }} />
              <span className="workbench-bar-view-label">
                {returnRoute.label
                  ? t("filesPage.backToFolder", "Back to {{folder}}", {
                      folder: returnRoute.label,
                    })
                  : t("filesPage.backToMyFiles", "Back to My Files")}
              </span>
            </button>
            <div className="workbench-bar-divider" />
          </>
        )}
        {(hasFiles || isCustomView) &&
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

      {/* Tool buttons - second row, only rendered when buttons exist */}
      {sectionsWithButtons.length > 0 && (
        <div className="workbench-bar-center">
          {sectionsWithButtons.map(
            ({ section, buttons: sectionButtons }, idx) => (
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
            ),
          )}
        </div>
      )}

      {/* Right: Global buttons - export group left, close anchored right */}
      <div className="workbench-bar-globals">
        {/* Share (viewer only; opens the same modal as My Files "Manage sharing") */}
        {currentView === "viewer" && sharingEnabled && (
          <ViewerShareButton
            disabled={
              totalItems === 0 || allButtonsDisabled || disableForFullscreen
            }
          />
        )}

        {/* Print */}
        {currentView === "viewer" &&
          renderWithTooltip(
            <ActionIcon
              variant="subtle"
              radius="md"
              className="workbench-bar-action-icon"
              onClick={handlePrint}
              disabled={
                totalItems === 0 || allButtonsDisabled || disableForFullscreen
              }
              aria-label={t("workbenchBar.print", "Print PDF")}
            >
              <PrintIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>,
            t("workbenchBar.print", "Print PDF"),
          )}

        {/* Download (file-level action — not relevant in custom views) */}
        {!isCustomView &&
          renderWithTooltip(
            <ActionIcon
              variant="subtle"
              radius="md"
              className="workbench-bar-action-icon"
              onClick={() => handleExportAll()}
              disabled={
                disableForFullscreen || totalItems === 0 || allButtonsDisabled
              }
            >
              <LocalIcon
                icon={icons.downloadIconName}
                width="1rem"
                height="1rem"
              />
            </ActionIcon>,
            downloadTooltip,
          )}

        {/* Save As */}
        {!isCustomView &&
          icons.saveAsIconName &&
          renderWithTooltip(
            <ActionIcon
              variant="subtle"
              radius="md"
              className="workbench-bar-action-icon"
              onClick={() => handleExportAll(true)}
              disabled={
                disableForFullscreen || totalItems === 0 || allButtonsDisabled
              }
            >
              <LocalIcon
                icon={icons.saveAsIconName}
                width="1rem"
                height="1rem"
              />
            </ActionIcon>,
            t("workbenchBar.saveAs", "Save As"),
          )}

        {/* Separator: export group | close */}
        {!isCustomView && (
          <div className="workbench-bar-divider workbench-bar-globals-sep" />
        )}

        {/* Close (context-aware: close all / close viewer file / close page editor) */}
        {!isCustomView &&
          renderWithTooltip(
            <ActionIcon
              variant="subtle"
              radius="md"
              className="workbench-bar-action-icon"
              onClick={handleClose}
              disabled={
                totalItems === 0 || allButtonsDisabled || disableForFullscreen
              }
              aria-label={
                currentView === "fileEditor"
                  ? t("workbenchBar.closeAll", "Close All")
                  : t("workbenchBar.closePdf", "Close PDF")
              }
            >
              <CloseIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>,
            currentView === "fileEditor"
              ? t("workbenchBar.closeAll", "Close All")
              : t("workbenchBar.closePdf", "Close PDF"),
          )}
      </div>
    </div>
  );
}

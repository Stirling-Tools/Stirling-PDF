import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import RightSidebar from "@app/components/tools/RightSidebar";
import Workbench from "@app/components/layout/Workbench";
import { alert } from "@app/components/toast";
import { DocumentHeader } from "@app/pages/DocumentHeader";
import { DocumentsHome } from "@app/pages/DocumentsHome";
import { PipPane, type PipCorner } from "@app/pages/PipPane";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import { useAllFiles } from "@app/contexts/file/fileHooks";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { PhoneLayoutProps } from "@core/pages/PhoneLayout";
import "@app/pages/PhoneLayout.css";

export type { PhoneLayoutProps };

interface TabProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function Tab({ icon, label, active, onClick }: TabProps) {
  return (
    <Button
      variant="tertiary"
      className="mobile-bottom-button"
      data-active={active}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      <span className="mobile-bottom-button-label">{label}</span>
    </Button>
  );
}

/**
 * Two full screens, the document and the tools, with the one you are not on
 * waiting as a card in the corner; tapping it grows it back to full screen. Both are the existing workbench and tool panel, always mounted, so a
 * tool keeps its settings and the document its place while the other is in
 * front. The "tools" view puts the tools in front.
 */
export function PhoneLayout({
  view,
  onSelectView,
  filesMode,
  onShowTools,
  onShowFiles,
  onOpenSettings,
}: PhoneLayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workbench } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const { fileIds, fileStubs } = useAllFiles();
  const { leftPanelView, toolRegistry, selectedToolKey } = useToolWorkflow();
  const { onRecentFileSelect } = useFilesModalContext();
  const { activeFileId, setActiveFileId } = useViewer();
  const [homeRequested, setHomeRequested] = useState(false);
  const [pipCorner, setPipCorner] = useState<PipCorner>("bottom-right");
  const [pipDrag, setPipDrag] = useState<{ x: number; y: number } | null>(null);

  // Bringing a file in from the home opens it, so the home steps aside.
  const previousFileCount = useRef(fileIds.length);
  useEffect(() => {
    if (fileIds.length > previousFileCount.current) setHomeRequested(false);
    previousFileCount.current = fileIds.length;
  }, [fileIds.length]);

  const toolsInFront = view === "tools" && !filesMode;
  const homeShown = !filesMode && (homeRequested || fileIds.length === 0);
  const workspaceOpen = !homeShown && !filesMode && fileIds.length > 0;
  const documentOpen = workspaceOpen && workbench === "viewer";
  // The tool panel shows the picker over a still-selected tool, so a key alone
  // does not mean a tool is open.
  const tool =
    leftPanelView !== "toolPicker" && selectedToolKey
      ? (toolRegistry[selectedToolKey] ?? null)
      : null;
  const currentDocument =
    fileStubs.find((stub) => stub.id === activeFileId) ?? fileStubs[0];

  const showHome = () => {
    if (filesMode) navigate(EDITOR_BASENAME);
    onSelectView("workbench");
    setHomeRequested(true);
  };

  const openDocument = async (stub: StirlingFileStub) => {
    try {
      if (!fileIds.includes(stub.id)) await onRecentFileSelect([stub]);
      navActions.setWorkbench("viewer");
      setActiveFileId(stub.id);
      setHomeRequested(false);
      onSelectView("workbench");
    } catch (error) {
      alert({
        alertType: "error",
        title: t("mobile.home.openFailed", "Couldn't open this document"),
        body: error instanceof Error ? error.message : undefined,
        isPersistentPopup: false,
      });
    }
  };

  const documentsTab = () => {
    if (toolsInFront && !homeShown) onSelectView("workbench");
    else showHome();
  };

  // Keep the open tool when coming from the document; tapping Tools again
  // while the tools are in front returns to the list.
  const toolsTab = () => {
    if (toolsInFront || !tool) onShowTools();
    else onSelectView("tools");
  };

  return (
    <div className="mobile-layout phone-layout" data-files-mode={filesMode}>
      <div
        className="pip-stage"
        data-corner={pipCorner}
        data-dragging={pipDrag !== null}
        style={
          pipDrag
            ? {
                ["--pip-dx" as string]: `${pipDrag.x}px`,
                ["--pip-dy" as string]: `${pipDrag.y}px`,
              }
            : undefined
        }
      >
        <PipPane
          front={!toolsInFront}
          // Only waits in the corner behind an open tool, never behind the list.
          pip={workspaceOpen && tool !== null}
          label={
            documentOpen
              ? (currentDocument?.name ?? "")
              : t("mobile.pip.fileCount", "{{count}} files", {
                  count: fileIds.length,
                })
          }
          caption={
            documentOpen
              ? t("mobile.pip.backToDocument", "Back to document")
              : t("mobile.pip.backToFiles", "Back to files")
          }
          icon={
            <Icon name={documentOpen ? "file-text" : "files"} size="1rem" />
          }
          onOpen={() => onSelectView("workbench")}
          onDrag={setPipDrag}
          onDrop={setPipCorner}
        >
          {documentOpen && <DocumentHeader onBack={showHome} />}
          <div className="pip-pane-body">
            <div className="pip-workbench">
              <Workbench hideWorkbenchBar={documentOpen} />
            </div>
            {homeShown && (
              <DocumentsHome
                onOpen={(stub) => void openDocument(stub)}
                onBrowseAll={onShowFiles}
              />
            )}
          </div>
        </PipPane>
        <PipPane
          front={toolsInFront}
          // Only an open tool waits in the corner; the list alone is not worth it.
          pip={tool !== null && !filesMode}
          label={tool?.name ?? ""}
          caption={t("mobile.pip.openSettings", "Open settings")}
          icon={tool?.icon}
          onOpen={() => onSelectView("tools")}
          onDrag={setPipDrag}
          onDrop={setPipCorner}
        >
          <div className="pip-pane-body">
            <RightSidebar />
          </div>
        </PipPane>
      </div>
      <nav className="mobile-bottom-bar">
        <Tab
          icon={<Icon name="file-text" size="1.5rem" />}
          label={t("mobile.home.title", "Documents")}
          active={!toolsInFront}
          onClick={documentsTab}
        />
        <Tab
          icon={<Icon name="layout-grid" size="1.5rem" />}
          label={t("quickAccess.allTools", "Tools")}
          active={toolsInFront}
          onClick={toolsTab}
        />
        <Tab
          icon={<Icon name="settings" size="1.5rem" />}
          label={t("mobile.home.settings", "Settings")}
          active={false}
          onClick={onOpenSettings}
        />
      </nav>
    </div>
  );
}

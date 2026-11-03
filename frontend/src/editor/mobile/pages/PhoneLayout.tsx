import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import RightSidebar from "@editor/components/tools/RightSidebar";
import Workbench from "@editor/components/layout/Workbench";
import { alert } from "@editor/components/toast";
import { ToolSheet } from "@editor/pages/ToolSheet";
import { DocumentHeader } from "@editor/pages/DocumentHeader";
import { DocumentsHome } from "@editor/pages/DocumentsHome";
import {
  useNavigationActions,
  useNavigationState,
} from "@editor/contexts/NavigationContext";
import { useAllFiles } from "@editor/contexts/file/fileHooks";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import { useFilesModalContext } from "@editor/contexts/FilesModalContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { EDITOR_BASENAME } from "@editor/routes/editorBasename";
import type { ToolId } from "@editor/types/toolId";
import type { StirlingFileStub } from "@editor/types/fileContext";
import { PhoneSignButton } from "@editor/pages/PhoneBottomBar";
import type { PhoneLayoutProps } from "@editor-core/pages/PhoneLayout";
import "@editor/pages/PhoneLayout.css";

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

const DOCUMENT_ACTIONS: ToolId[] = ["sign", "compress", "convert"];

/**
 * Document-first layout. The screen shows one of: the documents home, an open
 * document, or the full file library, and tools open over any of them in a
 * bottom sheet. The "tools" view is that sheet being open; HomePage's own
 * transitions close it when a file arrives or a full-screen tool takes over.
 * The workbench stays mounted under the home so an open document keeps its
 * place.
 */
export function PhoneLayout({
  view,
  onSelectView,
  filesMode,
  onShowTools,
  onShowFiles,
  onOpenSettings,
  onSelectSigningTool,
}: PhoneLayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workbench } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const { fileIds } = useAllFiles();
  const { handleToolSelect, toolRegistry, selectedToolKey } = useToolWorkflow();
  const { onRecentFileSelect } = useFilesModalContext();
  const { setActiveFileId } = useViewer();
  const [homeRequested, setHomeRequested] = useState(false);

  // Bringing a file in from the home opens it, so the home steps aside.
  const previousFileCount = useRef(fileIds.length);
  useEffect(() => {
    if (fileIds.length > previousFileCount.current) setHomeRequested(false);
    previousFileCount.current = fileIds.length;
  }, [fileIds.length]);

  const sheetOpen = view === "tools" && !filesMode;
  const homeShown = !filesMode && (homeRequested || fileIds.length === 0);
  const documentOpen =
    !homeShown && !filesMode && workbench === "viewer" && fileIds.length > 0;

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
    } catch (error) {
      alert({
        alertType: "error",
        title: t("mobile.home.openFailed", "Couldn't open this document"),
        body: error instanceof Error ? error.message : undefined,
        isPersistentPopup: false,
      });
    }
  };

  const openTool = (tool: ToolId) => {
    handleToolSelect(tool);
    onSelectView("tools");
  };

  return (
    <div className="mobile-layout phone-layout" data-files-mode={filesMode}>
      {documentOpen && <DocumentHeader onBack={showHome} />}
      <div className="phone-layout-stage">
        <div className="phone-layout-workbench">
          <Workbench hideWorkbenchBar={documentOpen} />
        </div>
        {homeShown && (
          <DocumentsHome
            onOpen={(stub) => void openDocument(stub)}
            onBrowseAll={onShowFiles}
          />
        )}
        {!filesMode && (
          <ToolSheet
            open={sheetOpen}
            docked={selectedToolKey !== null}
            onClose={() => onSelectView("workbench")}
          >
            <RightSidebar />
          </ToolSheet>
        )}
      </div>
      {documentOpen ? (
        <nav className="mobile-bottom-bar document-actions">
          {DOCUMENT_ACTIONS.flatMap((tool) => {
            const entry = toolRegistry[tool];
            return entry
              ? [
                  <Tab
                    key={tool}
                    icon={entry.icon}
                    label={entry.name}
                    active={false}
                    onClick={() => openTool(tool)}
                  />,
                ]
              : [];
          })}
          <Tab
            icon={<Icon name="layout-grid" size="1.5rem" />}
            label={t("mobile.document.allTools", "All tools")}
            active={sheetOpen}
            onClick={sheetOpen ? () => onSelectView("workbench") : onShowTools}
          />
        </nav>
      ) : (
        <nav className="mobile-bottom-bar">
          <PhoneSignButton onSelectTool={onSelectSigningTool} />
          <Tab
            icon={<Icon name="file-text" size="1.5rem" />}
            label={t("mobile.home.title", "Documents")}
            active={!sheetOpen && (homeShown || filesMode)}
            onClick={showHome}
          />
          <Tab
            icon={<Icon name="layout-grid" size="1.5rem" />}
            label={t("quickAccess.allTools", "Tools")}
            active={sheetOpen}
            onClick={sheetOpen ? () => onSelectView("workbench") : onShowTools}
          />
          <Tab
            icon={<Icon name="settings" size="1.5rem" />}
            label={t("mobile.home.settings", "Settings")}
            active={false}
            onClick={onOpenSettings}
          />
        </nav>
      )}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import type { ReactNode } from "react";
import { Icon } from "@app/ui/Icon";
import RightSidebar from "@app/components/tools/RightSidebar";
import Workbench from "@app/components/layout/Workbench";
import { ToolSheet } from "@app/pages/ToolSheet";
import { DocumentHeader } from "@app/pages/DocumentHeader";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useAllFiles } from "@app/contexts/file/fileHooks";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import type { ToolId } from "@app/types/toolId";
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

const DOCUMENT_ACTIONS: ToolId[] = ["sign", "compress", "convert"];

/**
 * The document stays on screen and tools open over it in a bottom sheet, so
 * there is no second "workspace" view to find. The "tools" view is the sheet
 * being open; HomePage's own transitions close it when a file arrives or a
 * full-screen tool takes over.
 */
export function PhoneLayout({
  view,
  onSelectView,
  filesMode,
  onShowTools,
  onShowAutomate,
  onShowFiles,
  onOpenSettings,
}: PhoneLayoutProps) {
  const { t } = useTranslation();
  const sheetOpen = view === "tools" && !filesMode;
  const { workbench } = useNavigationState();
  const { fileIds } = useAllFiles();
  const { handleToolSelect, toolRegistry } = useToolWorkflow();
  // A file is open in the viewer: show it as a document, with its own bar and actions.
  const documentOpen =
    !filesMode && workbench === "viewer" && fileIds.length > 0;

  const openTool = (tool: ToolId) => {
    handleToolSelect(tool);
    onSelectView("tools");
  };

  return (
    <div className="mobile-layout phone-layout" data-files-mode={filesMode}>
      {documentOpen && <DocumentHeader onBack={onShowFiles} />}
      <div className="phone-layout-stage">
        <div className="phone-layout-workbench">
          <Workbench hideWorkbenchBar={documentOpen} />
        </div>
        {!filesMode && (
          <ToolSheet open={sheetOpen} onClose={() => onSelectView("workbench")}>
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
          <Tab
            icon={<Icon name="layout-grid" size="1.5rem" />}
            label={t("quickAccess.allTools", "Tools")}
            active={sheetOpen}
            onClick={sheetOpen ? () => onSelectView("workbench") : onShowTools}
          />
          {onShowAutomate && (
            <Tab
              icon={<Icon name="waypoints" size="1.5rem" />}
              label={t("quickAccess.automate", "Automate")}
              active={false}
              onClick={onShowAutomate}
            />
          )}
          <Tab
            icon={<Icon name="folder" size="1.5rem" />}
            label={t("quickAccess.files", "Files")}
            active={filesMode}
            onClick={onShowFiles}
          />
          <Tab
            icon={<Icon name="settings" size="1.5rem" />}
            label={t("quickAccess.config", "Config")}
            active={false}
            onClick={onOpenSettings}
          />
        </nav>
      )}
    </div>
  );
}

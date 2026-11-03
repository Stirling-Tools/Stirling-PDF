import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import { useSidebarContext } from "@editor/contexts/SidebarContext";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import ToolPanel from "@editor/components/tools/ToolPanel";
import { usePoliciesEnabled } from "@editor/components/policies/usePoliciesEnabled";
import { EditorPipelinesPanel } from "@editor/components/policies/EditorPipelinesPanel";
import { ToolIcon } from "@editor/components/shared/ToolIcon";
import { ToolPanelHeader } from "@editor/components/shared/ToolPanelHeader";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { withViewTransition } from "@editor/utils/viewTransition";
import { Icon } from "@editor/ui/Icon";
import { ToolId } from "@editor/types/toolId";
import type { ToolRegistryEntry } from "@editor/data/toolsTaxonomy";
import {
  FullscreenToolPanel,
  useIsFullscreenExpanded,
} from "@editor/components/tools/FullscreenToolPanel";
import { useToolPanelGeometry } from "@editor/hooks/tools/useToolPanelGeometry";
import "@editor/components/tools/ToolPanel.css";

/**
 * Right-side rail wrapping the tool panel, which is fixed open: what the rail
 * owns is the panel's own chrome (the header and its back/close control).
 * Fullscreen takeover lives in FullscreenToolPanel.
 */
export default function RightSidebar() {
  const { t } = useTranslation();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef, quickAccessRef } = sidebarRefs;
  const isMobile = useIsMobile();
  const policiesEnabled = usePoliciesEnabled();

  const {
    leftPanelView,
    toolRegistry,
    setSearchQuery,
    selectedToolKey,
    handleToolSelect,
    handleBackToTools,
  } = useToolWorkflow();

  const fullscreenExpanded = useIsFullscreenExpanded();
  const fullscreenGeometry = useToolPanelGeometry({
    enabled: fullscreenExpanded,
    toolPanelRef,
    quickAccessRef,
  });

  const [allToolsView, setAllToolsView] = useState(false);

  const handleShowAllTools = () => {
    withViewTransition(() => setAllToolsView(true));
  };

  const handleBackToDefault = () => {
    withViewTransition(() => {
      setAllToolsView(false);
      setSearchQuery("");
    });
  };

  // The header shows [back] [search] when we have somewhere to go back to —
  // i.e. the user is in a specific tool, or already in the all-tools/search view.
  const inToolView = leftPanelView !== "toolPicker";
  // Show X (close) button only when there's somewhere to go back to.
  const showCloseButton = inToolView || allToolsView;

  const handleHeaderBack = () => {
    if (inToolView) {
      withViewTransition(() => handleBackToTools());
    } else {
      handleBackToDefault();
    }
  };

  const handleToolSelectWithTransition = (id: ToolId) => {
    withViewTransition(() => handleToolSelect(id));
  };

  const activeTool: ToolRegistryEntry | null =
    inToolView && selectedToolKey
      ? (toolRegistry[selectedToolKey] ?? null)
      : null;

  const expandedWidth = "18.5rem";

  return (
    <div
      ref={toolPanelRef}
      data-sidebar="tool-panel"
      data-tour={fullscreenExpanded ? undefined : "tool-panel"}
      className={`tool-panel flex flex-col ${fullscreenExpanded ? "tool-panel--fullscreen-active" : "overflow-hidden"} ${isMobile || fullscreenExpanded ? "border-l border-[var(--c-border-subtle)]" : "tool-panel--floating"} transition-all duration-300 ease-out ${isMobile ? "h-full border-r-0" : fullscreenExpanded ? "h-screen" : ""} ${fullscreenExpanded ? "tool-panel--fullscreen" : ""}`}
      style={{
        width: isMobile ? "100%" : expandedWidth,
        padding: "0",
      }}
    >
      {!fullscreenExpanded && (
        <div
          style={{
            opacity: 1,
            transition: "opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            height: "100%",
            width: isMobile ? "100%" : expandedWidth,
            maxWidth: isMobile ? "44rem" : undefined,
            marginInline: isMobile ? "auto" : undefined,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          <>
            {policiesEnabled && <EditorPipelinesPanel />}
            {activeTool ? (
              <ToolPanelHeader
                icon={
                  <ToolIcon
                    icon={activeTool.icon}
                    marginRight="0"
                    color="currentColor"
                  />
                }
                title={activeTool.name}
                onClose={handleHeaderBack}
                closeLabel={
                  inToolView
                    ? t("toolPanel.backToAllTools", "Back to all tools")
                    : t("toolPanel.goBack", "Go back")
                }
              />
            ) : showCloseButton ? (
              /* Closing a tool, not the panel: the panel itself is fixed open, so
                 with nothing to leave there is no header to show. */
              <div className="tool-panel__compact-header">
                <span className="tool-panel__compact-title">
                  {t("toolPanel.pdfTools", "PDF Tools")}
                </span>
                <div className="tool-panel__compact-header-actions">
                  <ActionIcon
                    variant="tertiary"
                    size="md"
                    shape="circle"
                    onClick={handleHeaderBack}
                    aria-label={
                      inToolView
                        ? t("toolPanel.backToAllTools", "Back to all tools")
                        : t("toolPanel.goBack", "Go back")
                    }
                    className="tool-panel__expand-btn"
                  >
                    <Icon name="x" size={"1.1rem"} />
                  </ActionIcon>
                </div>
              </div>
            ) : null}

            <ToolPanel
              allToolsView={allToolsView}
              onShowAllTools={handleShowAllTools}
              onToolSelect={handleToolSelectWithTransition}
              compact={false}
              /* Mobile keeps the workbench bar - and with it the super search -
                 on the other slide, so the list needs its own filter. */
              showSearch={isMobile}
            />
          </>
        </div>
      )}

      <FullscreenToolPanel geometry={fullscreenGeometry} />
    </div>
  );
}

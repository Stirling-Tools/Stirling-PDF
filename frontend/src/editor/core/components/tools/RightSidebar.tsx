import { useRef, useState } from "react";
import { Transition, useDirection } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { useSidebarContext } from "@editor/contexts/SidebarContext";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import ToolPanel from "@editor/components/tools/ToolPanel";
import { usePoliciesEnabled } from "@editor/components/policies/usePoliciesEnabled";
import { EditorPipelinesPanel } from "@editor/components/policies/EditorPipelinesPanel";
import { ToolIcon } from "@editor/components/shared/ToolIcon";
import { ToolPanelHeader } from "@editor/components/shared/ToolPanelHeader";
import { ActionIcon } from "@editor/ui/ActionIcon";
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

  const handleShowAllTools = () => setAllToolsView(true);

  const handleBackToDefault = () => {
    setAllToolsView(false);
    setSearchQuery("");
  };

  const inToolView = leftPanelView !== "toolPicker";

  const activeTool: ToolRegistryEntry | null =
    inToolView && selectedToolKey
      ? (toolRegistry[selectedToolKey] ?? null)
      : null;

  // The tool view slides over the picker from the trailing edge and back out.
  // A CSS transition rather than a View Transition: startViewTransition()
  // forces accelerated compositing, which segfaults WebKitGTK with its DMA-BUF
  // renderer off (WebKit bug 324730), and the Linux desktop app runs it that
  // way. The tool stays selected until it has left: a tool kept mounted after
  // the context cleared it can re-run its mount effects against the picker (the
  // text editor pins the view back to toolContent). The picker unmounts once
  // the tool view has covered it, so the page never holds two copies of a
  // tool's name or link.
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const toolLayerMounted = inToolView && !closing;
  const [toolLayerCovers, setToolLayerCovers] = useState(toolLayerMounted);
  if (toolLayerCovers && !toolLayerMounted) setToolLayerCovers(false);
  const { actions: navigationActions } = useNavigationActions();
  // Ask about unsaved changes before the slide, or the tool leaves and comes
  // back before the prompt shows. The prompt resolves the edits before it
  // continues, so handleBackToTools passes its own guard afterwards.
  const handleClose = () => {
    navigationActions.requestNavigation(() => {
      closingRef.current = true;
      setClosing(true);
    });
  };
  const handleToolLayerExited = () => {
    if (!closingRef.current) return;
    closingRef.current = false;
    setClosing(false);
    handleBackToTools();
  };
  const handlePickerSelect = (id: ToolId) => {
    closingRef.current = false;
    setClosing(false);
    handleToolSelect(id);
  };
  const { dir } = useDirection();
  const reduceMotion = useReducedMotion();
  const slideFromTrailingEdge = {
    in: { transform: "translateX(0)" },
    out: {
      transform: dir === "rtl" ? "translateX(-100%)" : "translateX(100%)",
    },
    transitionProperty: "transform",
  };

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
            <div className="tool-panel__stage">
              {!toolLayerCovers && (
                <div
                  className="tool-panel__picker-layer"
                  inert={toolLayerMounted}
                >
                  {allToolsView && (
                    <div className="tool-panel__compact-header">
                      <span className="tool-panel__compact-title">
                        {t("toolPanel.pdfTools", "PDF Tools")}
                      </span>
                      <div className="tool-panel__compact-header-actions">
                        <ActionIcon
                          variant="tertiary"
                          size="md"
                          shape="circle"
                          onClick={handleBackToDefault}
                          aria-label={t("toolPanel.goBack", "Go back")}
                          className="tool-panel__expand-btn"
                        >
                          <Icon name="x" size={"1.1rem"} />
                        </ActionIcon>
                      </div>
                    </div>
                  )}
                  <ToolPanel
                    view="toolPicker"
                    allToolsView={allToolsView}
                    onShowAllTools={handleShowAllTools}
                    onToolSelect={handlePickerSelect}
                    compact={false}
                    /* Mobile keeps the workbench bar - and with it the super search -
                     on the other slide, so the list needs its own filter. */
                    showSearch={isMobile}
                  />
                </div>
              )}
              <Transition
                mounted={toolLayerMounted}
                transition={slideFromTrailingEdge}
                onEntered={() => setToolLayerCovers(true)}
                onExited={handleToolLayerExited}
                duration={reduceMotion ? 0 : 220}
                timingFunction="ease"
              >
                {(styles) => (
                  <div className="tool-panel__tool-layer" style={styles}>
                    {activeTool && (
                      <ToolPanelHeader
                        icon={
                          <ToolIcon
                            icon={activeTool.icon}
                            marginRight="0"
                            color="currentColor"
                          />
                        }
                        title={activeTool.name}
                        onClose={handleClose}
                        closeLabel={t(
                          "toolPanel.backToAllTools",
                          "Back to all tools",
                        )}
                      />
                    )}
                    <ToolPanel
                      view="toolContent"
                      allToolsView={false}
                      onShowAllTools={handleShowAllTools}
                    />
                  </div>
                )}
              </Transition>
            </div>
          </>
        </div>
      )}

      <FullscreenToolPanel geometry={fullscreenGeometry} />
    </div>
  );
}

import { useEffect, useMemo } from "react";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import { useWorkbenchBar } from "@app/contexts/WorkbenchBarContext";
import { useToolPanelGeometry } from "@app/hooks/tools/useToolPanelGeometry";
import {
  AgentsFullscreenSection,
  useAgentChatOpen,
  useAgentsEnabled,
} from "@app/components/agents/AgentsPanel";
import FullscreenToolSurface from "@app/components/tools/FullscreenToolSurface";
import { ToolId } from "@app/types/toolId";

/** Derives whether the fullscreen tool picker is currently expanded. */
export function useIsFullscreenExpanded(): boolean {
  const { toolPanelMode, leftPanelView, readerMode } = useToolWorkflow();
  const isMobile = useIsMobile();
  const agentChatOpen = useAgentChatOpen();
  return (
    toolPanelMode === "fullscreen" &&
    leftPanelView === "toolPicker" &&
    !isMobile &&
    !readerMode &&
    !agentChatOpen
  );
}

/**
 * Self-contained fullscreen tool picker. Renders null when inactive, and takes
 * over the right rail (via FullscreenToolSurface) when fullscreen mode is on.
 * All fullscreen state and side-effects live here, not in RightSidebar.
 */
export function FullscreenToolPanel() {
  const {
    toolPanelMode,
    setToolPanelMode,
    leftPanelView,
    readerMode,
    searchQuery,
    setSearchQuery,
    filteredTools,
    toolRegistry,
    selectedToolKey,
    handleToolSelect,
  } = useToolWorkflow();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef, quickAccessRef } = sidebarRefs;
  const isMobile = useIsMobile();
  const agentsEnabled = useAgentsEnabled();
  const agentChatOpen = useAgentChatOpen();
  const { setAllButtonsDisabled } = useWorkbenchBar();
  const { preferences, updatePreference } = usePreferences();

  const fullscreenExpanded =
    toolPanelMode === "fullscreen" &&
    leftPanelView === "toolPicker" &&
    !isMobile &&
    !readerMode &&
    !agentChatOpen;

  useEffect(() => {
    setAllButtonsDisabled(fullscreenExpanded);
  }, [fullscreenExpanded, setAllButtonsDisabled]);

  const fullscreenGeometry = useToolPanelGeometry({
    enabled: fullscreenExpanded,
    toolPanelRef,
    quickAccessRef,
  });

  const matchedTextMap = useMemo(() => {
    const map = new Map<string, string>();
    filteredTools.forEach(({ item: [id], matchedText }) => {
      if (matchedText) map.set(id, matchedText);
    });
    return map;
  }, [filteredTools]);

  if (!fullscreenExpanded) return null;

  return (
    <FullscreenToolSurface
      searchQuery={searchQuery}
      toolRegistry={toolRegistry}
      filteredTools={filteredTools}
      selectedToolKey={selectedToolKey}
      showDescriptions={preferences.showLegacyToolDescriptions}
      matchedTextMap={matchedTextMap}
      onSearchChange={setSearchQuery}
      onSelect={(id: ToolId) => handleToolSelect(id)}
      onToggleDescriptions={() =>
        updatePreference(
          "showLegacyToolDescriptions",
          !preferences.showLegacyToolDescriptions,
        )
      }
      onExitFullscreenMode={() => setToolPanelMode("sidebar")}
      geometry={fullscreenGeometry}
      agentsSlot={
        agentsEnabled && !searchQuery ? <AgentsFullscreenSection /> : null
      }
    />
  );
}

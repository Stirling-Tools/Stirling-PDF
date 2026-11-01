import { useEffect, useMemo } from "react";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import { useWorkbenchBar } from "@editor/contexts/WorkbenchBarContext";
import FullscreenToolSurface from "@editor/components/tools/FullscreenToolSurface";
import { ToolId } from "@editor/types/toolId";
import type { ToolPanelGeometry } from "@editor/hooks/tools/useToolPanelGeometry";

/** Derives whether the fullscreen tool picker is currently expanded. */
export function useIsFullscreenExpanded(): boolean {
  const { toolPanelMode, leftPanelView, readerMode } = useToolWorkflow();
  const isMobile = useIsMobile();
  return (
    toolPanelMode === "fullscreen" &&
    leftPanelView === "toolPicker" &&
    !isMobile &&
    !readerMode
  );
}

interface FullscreenToolPanelProps {
  geometry: ToolPanelGeometry | null;
}

/**
 * Self-contained fullscreen tool picker. Renders null when inactive, and takes
 * over the right rail (via FullscreenToolSurface) when fullscreen mode is on.
 * Geometry is computed by the parent (RightSidebar) so its useLayoutEffect runs
 * after the ref div is committed, ensuring toolPanelRef.current is always set.
 */
export function FullscreenToolPanel({ geometry }: FullscreenToolPanelProps) {
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
  const isMobile = useIsMobile();
  const { setAllButtonsDisabled } = useWorkbenchBar();
  const { preferences, updatePreference } = usePreferences();

  const fullscreenExpanded =
    toolPanelMode === "fullscreen" &&
    leftPanelView === "toolPicker" &&
    !isMobile &&
    !readerMode;

  useEffect(() => {
    setAllButtonsDisabled(fullscreenExpanded);
  }, [fullscreenExpanded, setAllButtonsDisabled]);

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
      geometry={geometry}
    />
  );
}

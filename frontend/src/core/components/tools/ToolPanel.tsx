import { useEffect, useMemo, useRef, useState } from "react";
import { useRainbowThemeContext } from "@app/components/shared/RainbowThemeProvider";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { usePreferences } from "@app/contexts/PreferencesContext";
import ToolPicker from "@app/components/tools/ToolPicker";
import SearchResults from "@app/components/tools/SearchResults";
import ToolRenderer from "@app/components/tools/ToolRenderer";
import ToolSearch from "@app/components/tools/toolPicker/ToolSearch";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import rainbowStyles from "@app/styles/rainbow.module.css";
import { ActionIcon, ScrollArea } from "@mantine/core";
import { ToolId } from "@app/types/toolId";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useTranslation } from "react-i18next";
import FullscreenToolSurface from "@app/components/tools/FullscreenToolSurface";
import { ToolPanelViewerBar } from "@app/components/tools/ToolPanelViewerBar";
import { useToolPanelGeometry } from "@app/hooks/tools/useToolPanelGeometry";
import { useRightRail } from "@app/contexts/RightRailContext";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import "@app/components/tools/ToolPanel.css";

// No props needed - component uses context

export default function ToolPanel() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef, quickAccessRef, rightRailRef } = sidebarRefs;
  const isMobile = useIsMobile();

  const {
    leftPanelView,
    isPanelVisible,
    searchQuery,
    filteredTools,
    toolRegistry,
    setSearchQuery,
    selectedToolKey,
    handleToolSelect,
    handleBackToTools,
    setPreviewFile,
    toolPanelMode,
    setToolPanelMode,
    setLeftPanelView,
    setReaderMode,
    setSidebarsVisible,
    sidebarsVisible,
    readerMode,
  } = useToolWorkflow();

  const { setAllRightRailButtonsDisabled } = useRightRail();
  const { preferences, updatePreference } = usePreferences();

  const isFullscreenMode = toolPanelMode === "fullscreen";
  const toolPickerVisible = !readerMode;
  const fullscreenExpanded =
    isFullscreenMode &&
    leftPanelView === "toolPicker" &&
    !isMobile &&
    toolPickerVisible;

  // Disable right rail buttons when fullscreen mode is active
  useEffect(() => {
    setAllRightRailButtonsDisabled(fullscreenExpanded);
  }, [fullscreenExpanded, setAllRightRailButtonsDisabled]);

  const fullscreenGeometry = useToolPanelGeometry({
    enabled: fullscreenExpanded,
    toolPanelRef,
    quickAccessRef,
    rightRailRef,
  });

  const toggleLabel = isFullscreenMode
    ? t("toolPanel.toggle.sidebar", "Switch to sidebar mode")
    : t("toolPanel.toggle.fullscreen", "Switch to fullscreen mode");

  const handleExpand = () => {
    if (readerMode) setReaderMode(false);
    if (leftPanelView === "hidden") setLeftPanelView("toolPicker");
    if (!sidebarsVisible) setSidebarsVisible(true);
  };

  const handleCollapse = () => {
    setLeftPanelView("hidden");
  };

  const [focusSearch, setFocusSearch] = useState(false);
  const focusSearchOnNextOpen = useRef(false);

  const handleExpandAndSearch = () => {
    focusSearchOnNextOpen.current = true;
    handleExpand();
  };

  // Once the panel becomes visible, consume the focus-search request
  useEffect(() => {
    if (isPanelVisible && focusSearchOnNextOpen.current) {
      focusSearchOnNextOpen.current = false;
      setFocusSearch(true);
      // Reset after one render so autoFocus doesn't re-fire on subsequent renders
      const id = setTimeout(() => setFocusSearch(false), 100);
      return () => clearTimeout(id);
    }
  }, [isPanelVisible]);

  const computedWidth = () => {
    if (isMobile) {
      return "100%";
    }

    if (!isPanelVisible) {
      return "3.5rem";
    }

    return "18.5rem";
  };

  const matchedTextMap = useMemo(() => {
    const map = new Map<string, string>();
    filteredTools.forEach(({ item: [id], matchedText }) => {
      if (matchedText) {
        map.set(id, matchedText);
      }
    });
    return map;
  }, [filteredTools]);

  return (
    <div
      ref={toolPanelRef}
      data-sidebar="tool-panel"
      data-tour={fullscreenExpanded ? undefined : "tool-panel"}
      className={`tool-panel flex flex-col ${fullscreenExpanded ? "tool-panel--fullscreen-active" : "overflow-hidden"} bg-[var(--bg-toolbar)] border-l border-[var(--border-subtle)] transition-all duration-300 ease-out ${
        isRainbowMode ? rainbowStyles.rainbowPaper : ""
      } ${isMobile ? "h-full border-r-0" : "h-screen"} ${fullscreenExpanded ? "tool-panel--fullscreen" : ""}`}
      style={{
        width: computedWidth(),
        padding: "0",
      }}
    >
      {!fullscreenExpanded && !isPanelVisible && !isMobile && (
        <div className="tool-panel__collapsed-strip">
          <ActionIcon
            variant="outline"
            color="gray.4"
            radius="xl"
            size="md"
            className="tool-panel__expand-btn"
            onClick={handleExpand}
            aria-label={t("toolPanel.expand", "Expand panel")}
          >
            <ChevronLeftIcon sx={{ fontSize: "1.1rem" }} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="md"
            size="md"
            className="tool-panel__collapsed-search-btn"
            onClick={handleExpandAndSearch}
            aria-label={t("toolPanel.search", "Search tools")}
            style={{ marginTop: "8px" }}
          >
            <SearchIcon sx={{ fontSize: "1.25rem" }} />
          </ActionIcon>
        </div>
      )}

      {!fullscreenExpanded && isPanelVisible && (
        <div
          style={{
            opacity: 1,
            transition: "opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Viewer mode tools — annotate, redact, form fill */}
          <ToolPanelViewerBar />

          <div
            className="tool-panel__search-row"
            style={{
              backgroundColor: "transparent",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <ToolSearch
              value={searchQuery}
              onChange={setSearchQuery}
              toolRegistry={toolRegistry}
              mode="filter"
              autoFocus={focusSearch}
              iconOverride={
                leftPanelView === "toolContent" ? (
                  <ActionIcon
                    variant="transparent"
                    radius="md"
                    size="1.25rem"
                    onClick={handleBackToTools}
                    aria-label={t("toolPanel.backToTools", "Back to tools")}
                    style={{ color: "var(--search-text-and-icon-color)" }}
                  >
                    <ArrowBackIcon sx={{ fontSize: "1.25rem" }} />
                  </ActionIcon>
                ) : undefined
              }
            />
            <ActionIcon
              variant="outline"
              radius="xl"
              size="md"
              onClick={handleCollapse}
              aria-label={t("toolPanel.collapse", "Collapse panel")}
              className="tool-panel__expand-btn"
              style={{ flexShrink: 0 }}
            >
              <ChevronRightIcon sx={{ fontSize: "1.1rem" }} />
            </ActionIcon>
          </div>

          {searchQuery.trim().length > 0 ? (
            <div className="flex-1 flex flex-col overflow-y-auto">
              <SearchResults
                filteredTools={filteredTools}
                onSelect={(id) => handleToolSelect(id as ToolId)}
                searchQuery={searchQuery}
              />
            </div>
          ) : leftPanelView === "toolPicker" ? (
            <div className="flex-1 flex flex-col overflow-auto">
              <ToolPicker
                selectedToolKey={selectedToolKey}
                onSelect={(id) => handleToolSelect(id as ToolId)}
                filteredTools={filteredTools}
                isSearching={Boolean(
                  searchQuery && searchQuery.trim().length > 0,
                )}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-hidden">
                <ScrollArea h="100%">
                  {selectedToolKey ? (
                    <ToolRenderer
                      selectedToolKey={selectedToolKey}
                      onPreviewFile={setPreviewFile}
                    />
                  ) : (
                    <div className="tool-panel__placeholder">
                      {t(
                        "toolPanel.placeholder",
                        "Choose a tool to get started",
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      )}

      {fullscreenExpanded && (
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
          toggleLabel={toggleLabel}
          geometry={fullscreenGeometry}
        />
      )}
    </div>
  );
}

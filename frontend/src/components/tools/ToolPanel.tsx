import { useRainbowThemeContext } from "../shared/RainbowThemeProvider";
import { useToolWorkflow } from "../../contexts/ToolWorkflowContext";
import ToolPicker from "./ToolPicker";
import SearchResults from "./SearchResults";
import ToolRenderer from "./ToolRenderer";
import ToolSearch from "./toolPicker/ToolSearch";
import { useSidebarContext } from "../../contexts/SidebarContext";
import rainbowStyles from "../../styles/rainbow.module.css";
import { ScrollArea } from "@mantine/core";
import { ToolId } from "../../types/toolId";
import { useIsMobile } from "../../hooks/useIsMobile";

// No props needed - component uses context

export default function ToolPanel() {
  const { isRainbowMode } = useRainbowThemeContext();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef } = sidebarRefs;
  const isMobile = useIsMobile();


  // Use context-based hooks to eliminate prop drilling
  const {
    leftPanelView,
    isPanelVisible,
    searchQuery,
    filteredTools,
    toolRegistry,
    setSearchQuery,
  } = useToolWorkflow();

  const { selectedToolKey, handleToolSelect } = useToolWorkflow();
  const { setPreviewFile } = useToolWorkflow();

  return (
    <div
      ref={toolPanelRef}
      data-sidebar="tool-panel"
      className={`${isMobile ? "h-full" : "h-screen"} flex flex-col overflow-hidden bg-[var(--bg-toolbar)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-out ${
        isRainbowMode ? rainbowStyles.rainbowPaper : ''
      }`}
      style={{
        width: isMobile ? (isPanelVisible ? "100%" : "0") : isPanelVisible ? "18.5rem" : "0",
        padding: "0",
        borderRight: isMobile ? "none" : undefined,
      }}
    >
      <div
        style={{
          opacity: isPanelVisible ? 1 : 0,
          transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Search Bar - Always visible at the top */}
        <div
          style={{
            backgroundColor: 'var(--tool-panel-search-bg)',
            borderBottom: '1px solid var(--tool-panel-search-border-bottom)',
            padding: '0.75rem 1rem',
          }}
        >
          <ToolSearch
            value={searchQuery}
            onChange={setSearchQuery}
            toolRegistry={toolRegistry}
            mode="filter"
          />
        </div>

        {searchQuery.trim().length > 0 ? (
          // Searching view (replaces both picker and content)
          <div className="flex-1 flex flex-col overflow-y-auto">
              <SearchResults
                filteredTools={filteredTools}
                onSelect={(id) => handleToolSelect(id as ToolId)}
                searchQuery={searchQuery}
              />
          </div>
        ) : leftPanelView === 'toolPicker' ? (
          // Tool Picker View
          <div className="flex-1 flex flex-col overflow-auto">
            <ToolPicker
              selectedToolKey={selectedToolKey}
              onSelect={(id) => handleToolSelect(id as ToolId)}
              filteredTools={filteredTools}
              isSearching={Boolean(searchQuery && searchQuery.trim().length > 0)}
            />
          </div>
        ) : (
          // Selected Tool Content View
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tool content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea h="100%">
                {selectedToolKey && (
                  <ToolRenderer
                    selectedToolKey={selectedToolKey}
                    onPreviewFile={setPreviewFile}
                  />
                )}
              </ScrollArea>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { ScrollArea } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import ToolPicker from "@app/components/tools/ToolPicker";
import SearchResults from "@app/components/tools/SearchResults";
import ToolRenderer from "@app/components/tools/ToolRenderer";
import ToolSearch from "@app/components/tools/toolPicker/ToolSearch";
import { ToolPanelViewerBar } from "@app/components/tools/ToolPanelViewerBar";
import { ToolId } from "@app/types/toolId";

interface ToolPanelProps {
  /** Whether to expand into the full categorised tools view (with search). */
  allToolsView: boolean;
  /** Trigger to enter the all-tools view (from the "View all tools" button). */
  onShowAllTools: () => void;
  /**
   * Tool-selection handler injected by {@code RightSidebar} so the click can
   * be wrapped in a View Transition (the tool card morphs into the header
   * pill). Falls back to the workflow context's handler when not provided.
   */
  onToolSelect?: (id: ToolId) => void;
  /** Whether to render the compact (favourites + recommended only) view. */
  compact?: boolean;
  /**
   * Render a tool filter at the head of the panel. Set where the workbench
   * bar's super search is out of reach, so the list stays searchable in place.
   */
  showSearch?: boolean;
}

/** Tool list and renderer for the right rail; rail chrome lives in RightSidebar. */
export default function ToolPanel({
  allToolsView,
  onShowAllTools,
  onToolSelect,
  compact: compactProp,
  showSearch = false,
}: ToolPanelProps) {
  const { t } = useTranslation();
  const {
    leftPanelView,
    searchQuery,
    setSearchQuery,
    filteredTools,
    toolRegistry,
    selectedToolKey,
    handleToolSelect,
    setPreviewFile,
  } = useToolWorkflow();
  const selectTool = onToolSelect ?? handleToolSelect;

  // Only offer the filter over the list itself; once a tool is open the panel
  // belongs to that tool. Deriving the results branch from the same flag keeps
  // the input and what it filters from drifting apart.
  const panelSearch = showSearch && leftPanelView === "toolPicker";
  const searching = searchQuery.trim().length > 0;

  return (
    <>
      {/* Viewer mode tools — annotate, redact, form fill */}
      <ToolPanelViewerBar />

      {panelSearch && (
        <div className="tool-panel__search">
          <ToolSearch
            value={searchQuery}
            onChange={setSearchQuery}
            toolRegistry={toolRegistry}
            mode="filter"
          />
        </div>
      )}

      {searching && (allToolsView || panelSearch) ? (
        <div className="flex-1 flex flex-col overflow-y-auto">
          <SearchResults
            filteredTools={filteredTools}
            onSelect={(id) => selectTool(id as ToolId)}
            searchQuery={searchQuery}
          />
        </div>
      ) : leftPanelView === "toolPicker" ? (
        <div className="flex-1 flex flex-col overflow-auto">
          <ToolPicker
            selectedToolKey={selectedToolKey}
            onSelect={(id) => selectTool(id as ToolId)}
            filteredTools={filteredTools}
            isSearching={searching}
            compact={compactProp ?? !allToolsView}
            onShowAllTools={onShowAllTools}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea h="100%">
            {selectedToolKey ? (
              <ToolRenderer
                selectedToolKey={selectedToolKey}
                onPreviewFile={setPreviewFile}
              />
            ) : (
              <div className="tool-panel__placeholder">
                {t("toolPanel.placeholder", "Choose a tool to get started")}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </>
  );
}

import { useRef } from "react";
import { createPortal } from "react-dom";
import { ScrollArea, Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ToolSearch from "@app/components/tools/toolPicker/ToolSearch";
import FullscreenToolList from "@app/components/tools/FullscreenToolList";
import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { ToolId } from "@app/types/toolId";
import { useFocusTrap } from "@app/hooks/useFocusTrap";
import "@app/components/tools/ToolPanel.css";
import { ToolPanelGeometry } from "@app/hooks/tools/useToolPanelGeometry";

interface FullscreenToolSurfaceProps {
  searchQuery: string;
  toolRegistry: Partial<Record<ToolId, ToolRegistryEntry>>;
  filteredTools: Array<{
    item: [ToolId, ToolRegistryEntry];
    matchedText?: string;
  }>;
  selectedToolKey: string | null;
  showDescriptions: boolean;
  matchedTextMap: Map<string, string>;
  onSearchChange: (value: string) => void;
  onSelect: (id: ToolId) => void;
  onToggleDescriptions: () => void;
  onExitFullscreenMode: () => void;
  geometry: ToolPanelGeometry | null;
}

const FullscreenToolSurface = ({
  searchQuery,
  toolRegistry,
  filteredTools,
  selectedToolKey,
  showDescriptions,
  matchedTextMap,
  onSearchChange,
  onSelect,
  onToggleDescriptions,
  onExitFullscreenMode: _onExitFullscreenMode,
  geometry,
}: FullscreenToolSurfaceProps) => {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Enable focus trap when surface is active
  useFocusTrap(surfaceRef, true);

  if (!geometry) return null;

  const style = {
    left: `${geometry.left}px`,
    top: `${geometry.top}px`,
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
  };

  const surface = (
    <div
      className="tool-panel__fullscreen-surface"
      style={style}
      role="region"
      aria-label={t(
        "toolPanel.fullscreen.heading",
        "All tools (fullscreen view)",
      )}
      data-tour="tool-panel"
    >
      <div ref={surfaceRef} className="tool-panel__fullscreen-surface-inner">
        <div className="tool-panel__fullscreen-controls">
          <ToolSearch
            value={searchQuery}
            onChange={onSearchChange}
            toolRegistry={toolRegistry}
            mode="filter"
            autoFocus
          />
          <Switch
            checked={showDescriptions}
            onChange={() => onToggleDescriptions()}
            size="md"
            labelPosition="left"
            label={t("toolPanel.fullscreen.showDetails", "Show Details")}
          />
        </div>

        <div className="tool-panel__fullscreen-body">
          <ScrollArea
            className="tool-panel__fullscreen-scroll"
            offsetScrollbars
          >
            <FullscreenToolList
              filteredTools={filteredTools}
              searchQuery={searchQuery}
              showDescriptions={showDescriptions}
              selectedToolKey={selectedToolKey}
              matchedTextMap={matchedTextMap}
              onSelect={onSelect}
            />
          </ScrollArea>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return surface;
  return createPortal(surface, document.body);
};

export default FullscreenToolSurface;

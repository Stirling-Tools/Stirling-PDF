import { useRef } from "react";
import { ScrollArea, Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ToolSearch from "@app/components/tools/toolPicker/ToolSearch";
import FullscreenToolList from "@app/components/tools/FullscreenToolList";
import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { ToolId } from "@app/types/toolId";
import { useFocusTrap } from "@app/hooks/useFocusTrap";
import { LogoIcon } from "@app/components/shared/LogoIcon";
import { Wordmark } from "@app/components/shared/Wordmark";
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

  const brandAltText = t("home.mobile.brandAlt", "Stirling PDF logo");

  const style = geometry
    ? {
        left: `${geometry.left}px`,
        top: `${geometry.top}px`,
        width: `${geometry.width}px`,
        height: `${geometry.height}px`,
      }
    : undefined;

  return (
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
        <header className="tool-panel__fullscreen-header">
          <div className="tool-panel__fullscreen-brand">
            <LogoIcon className="tool-panel__fullscreen-brand-icon" />
            <Wordmark
              alt={brandAltText}
              className="tool-panel__fullscreen-brand-text"
            />
          </div>
        </header>

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
};

export default FullscreenToolSurface;

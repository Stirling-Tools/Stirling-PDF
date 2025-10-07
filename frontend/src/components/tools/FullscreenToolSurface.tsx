import { useState, useRef } from 'react';
import { ActionIcon, ScrollArea, Switch, Tooltip, useMantineColorScheme } from '@mantine/core';
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';
import { useTranslation } from 'react-i18next';
import ToolSearch from './toolPicker/ToolSearch';
import FullscreenToolList from './FullscreenToolList';
import FullscreenToolSettings from './FullscreenToolSettings';
import { ToolRegistryEntry } from '../../data/toolsTaxonomy';
import { ToolId } from '../../types/toolId';
import { useFocusTrap } from '../../hooks/tools/useFocusTrap';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { BASE_PATH } from '../../constants/app';
import './ToolPanel.css';

interface FullscreenToolSurfaceProps {
  searchQuery: string;
  toolRegistry: Record<string, ToolRegistryEntry>;
  filteredTools: Array<{ item: [string, ToolRegistryEntry]; matchedText?: string }>;
  selectedToolKey: string | null;
  showDescriptions: boolean;
  matchedTextMap: Map<string, string>;
  onSearchChange: (value: string) => void;
  onSelect: (id: ToolId) => void;
  onToggleDescriptions: () => void;
  onExitFullscreenMode: () => void;
  toggleLabel: string;
  geometry: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
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
  onExitFullscreenMode,
  toggleLabel,
  geometry,
}: FullscreenToolSurfaceProps) => {
  const { t } = useTranslation();
  const { colorScheme } = useMantineColorScheme();
  const { fullscreenToolSettings, setFullscreenToolSettings } = useToolWorkflow();
  const [isExiting, setIsExiting] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Enable focus trap when surface is active
  useFocusTrap(surfaceRef, !isExiting);

  const brandAltText = t("home.mobile.brandAlt", "Stirling PDF logo");
  const brandIconSrc = `${BASE_PATH}/branding/StirlingPDFLogoNoText${
    colorScheme === "dark" ? "Dark" : "Light"
  }.svg`;
  const brandTextSrc = `${BASE_PATH}/branding/StirlingPDFLogo${
    colorScheme === "dark" ? "White" : "Black"
  }Text.svg`;

  const handleExit = () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      onExitFullscreenMode();
      return;
    }

    setIsExiting(true);
    setTimeout(() => {
      onExitFullscreenMode();
    }, 220); // Match animation duration (0.22s)
  };


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
      aria-label={t('toolPanel.fullscreen.heading', 'All tools (fullscreen view)')}
    >
      <div
        ref={surfaceRef}
        className={`tool-panel__fullscreen-surface-inner ${isExiting ? 'tool-panel__fullscreen-surface-inner--exiting' : ''}`}
      >
        <header className="tool-panel__fullscreen-header">
          <div className="tool-panel__fullscreen-brand">
            <img src={brandIconSrc} alt="" className="tool-panel__fullscreen-brand-icon" />
            <img src={brandTextSrc} alt={brandAltText} className="tool-panel__fullscreen-brand-text" />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <FullscreenToolSettings
              settings={fullscreenToolSettings}
              onChange={setFullscreenToolSettings}
            />
            <Tooltip label={toggleLabel} position="bottom" withArrow>
              <ActionIcon
                variant="subtle"
                radius="xl"
                size="md"
                onClick={handleExit}
                aria-label={toggleLabel}
                style={{ color: 'var(--right-rail-icon)' }}
              >
                <ViewSidebarRoundedIcon fontSize="small" />
              </ActionIcon>
            </Tooltip>
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
            label={t('toolPanel.fullscreen.showDetails', 'Show Details')}
          />
        </div>

        <div className="tool-panel__fullscreen-body">
          <ScrollArea className="tool-panel__fullscreen-scroll" offsetScrollbars>
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



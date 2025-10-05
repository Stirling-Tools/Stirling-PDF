import { useEffect, useState, useRef } from 'react';
import { ActionIcon, ScrollArea, Switch, Tooltip, useMantineColorScheme } from '@mantine/core';
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';
import { useTranslation } from 'react-i18next';
import ToolSearch from './toolPicker/ToolSearch';
import LegacyToolList from './LegacyToolList';
import { ToolRegistryEntry } from '../../data/toolsTaxonomy';
import { ToolId } from '../../types/toolId';
import { useFocusTrap } from '../../hooks/tools/useFocusTrap';
import { BASE_PATH } from '../../constants/app';
import './ToolPanel.css';

interface LegacyToolSurfaceProps {
  searchQuery: string;
  toolRegistry: Record<string, ToolRegistryEntry>;
  filteredTools: Array<{ item: [string, ToolRegistryEntry]; matchedText?: string }>;
  selectedToolKey: string | null;
  showDescriptions: boolean;
  matchedTextMap: Map<string, string>;
  onSearchChange: (value: string) => void;
  onSelect: (id: ToolId) => void;
  onToggleDescriptions: () => void;
  onExitLegacyMode: () => void;
  toggleLabel: string;
  geometry: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
}

const LegacyToolSurface = ({
  searchQuery,
  toolRegistry,
  filteredTools,
  selectedToolKey,
  showDescriptions,
  matchedTextMap,
  onSearchChange,
  onSelect,
  onToggleDescriptions,
  onExitLegacyMode,
  toggleLabel,
  geometry,
}: LegacyToolSurfaceProps) => {
  const { t } = useTranslation();
  const { colorScheme } = useMantineColorScheme();
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
      onExitLegacyMode();
      return;
    }

    setIsExiting(true);
    setTimeout(() => {
      onExitLegacyMode();
    }, 220); // Match animation duration (0.22s)
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      className="tool-panel__legacy-surface"
      style={style}
      role="region"
      aria-label={t('toolPanel.legacy.heading', 'All tools (legacy view)')}
    >
      <div
        ref={surfaceRef}
        className={`tool-panel__legacy-surface-inner ${isExiting ? 'tool-panel__legacy-surface-inner--exiting' : ''}`}
      >
        <header className="tool-panel__legacy-header">
          <div className="tool-panel__legacy-brand">
            <img src={brandIconSrc} alt="" className="tool-panel__legacy-brand-icon" />
            <img src={brandTextSrc} alt={brandAltText} className="tool-panel__legacy-brand-text" />
          </div>
          <Tooltip label={toggleLabel} position="bottom" withArrow>
            <ActionIcon
              variant="subtle"
              radius="xl"
              size="md"
              onClick={handleExit}
              aria-label={toggleLabel}
            >
              <ViewSidebarRoundedIcon fontSize="small" />
            </ActionIcon>
          </Tooltip>
        </header>

        <div className="tool-panel__legacy-controls">
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
            label={showDescriptions ? t('toolPanel.legacy.descriptionsOn', 'Showing descriptions') : t('toolPanel.legacy.descriptionsOff', 'Descriptions hidden')}
          />
        </div>

        <div className="tool-panel__legacy-body">
          <ScrollArea className="tool-panel__legacy-scroll" offsetScrollbars>
            <LegacyToolList
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

export default LegacyToolSurface;

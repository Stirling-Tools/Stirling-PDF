import { useEffect } from 'react';
import { ActionIcon, Group, ScrollArea, Switch, Text, Tooltip } from '@mantine/core';
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';
import { useTranslation } from 'react-i18next';
import ToolSearch from './toolPicker/ToolSearch';
import LegacyToolList from './LegacyToolList';
import { ToolRegistryEntry } from '../../data/toolsTaxonomy';
import { ToolId } from '../../types/toolId';
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onExitLegacyMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExitLegacyMode]);

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
      <div className="tool-panel__legacy-surface-inner">
        <header className="tool-panel__legacy-header">
          <div className="tool-panel__legacy-heading">
            <Text fw={700} size="lg">
              {t('toolPanel.legacy.heading', 'All tools (legacy view)')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('toolPanel.legacy.tagline', 'Browse and launch tools while keeping the classic full-width gallery.')}
            </Text>
          </div>
          <Tooltip label={toggleLabel} position="bottom" withArrow>
            <ActionIcon
              variant="subtle"
              radius="xl"
              size="lg"
              onClick={onExitLegacyMode}
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

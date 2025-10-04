import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Group, Paper, ScrollArea, Text, Tooltip } from '@mantine/core';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import ToolSearch from './toolPicker/ToolSearch';
import ToolPicker from './ToolPicker';
import SearchResults from './SearchResults';
import { ToolId } from '../../types/toolId';
import './ToolPanelOverlay.css';

interface ToolPanelOverlayProps {
  isOpen: boolean;
}

const EXIT_ANIMATION_MS = 320;

export default function ToolPanelOverlay({ isOpen }: ToolPanelOverlayProps) {
  const { t } = useTranslation();
  const {
    searchQuery,
    setSearchQuery,
    filteredTools,
    selectedToolKey,
    handleToolSelect,
    toolRegistry,
    setToolPanelMode,
    toolPanelMode,
    setLeftPanelView,
  } = useToolWorkflow();

  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      document.documentElement.style.setProperty('overflow', 'hidden');
      return;
    }

    if (shouldRender) {
      setIsClosing(true);
      const timeout = window.setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
        document.documentElement.style.removeProperty('overflow');
      }, EXIT_ANIMATION_MS);
      return () => {
        window.clearTimeout(timeout);
        document.documentElement.style.removeProperty('overflow');
      };
    }

    document.documentElement.style.removeProperty('overflow');
    setShouldRender(false);
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!isOpen) return;
    return () => {
      document.documentElement.style.removeProperty('overflow');
    };
  }, [isOpen]);

  const showSearchResults = useMemo(() => searchQuery.trim().length > 0, [searchQuery]);
  const totalToolCount = showSearchResults ? filteredTools.length : Object.keys(toolRegistry).length;

  if (!shouldRender) {
    return null;
  }

  const handleClose = () => {
    setSearchQuery('');
    setLeftPanelView('hidden');
  };

  const toggleLabel = toolPanelMode === 'fullscreen'
    ? t('toolPanel.modeToggle.sidebar', 'Switch to advanced sidebar')
    : t('toolPanel.modeToggle.fullscreen', 'Switch to legacy fullscreen');

  return (
    <div
      className={`tool-panel-overlay ${isClosing || !isOpen ? 'tool-panel-overlay--closing' : 'tool-panel-overlay--open'}`}
      role="dialog"
      aria-modal
      aria-label={t('toolPanel.overlay.title', 'All tools')}
    >
      <Paper shadow="xl" radius={0} className="tool-panel-overlay__paper">
        <header className="tool-panel-overlay__header">
          <div>
            <Text fw={600} size="lg">
              {t('toolPanel.overlay.title', 'All tools')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('toolPanel.overlay.subtitle', 'Browse and launch tools in the legacy fullscreen catalog.')}
            </Text>
          </div>
          <Group gap="xs">
            <Tooltip label={toggleLabel} position="bottom" withArrow>
              <ActionIcon
                variant="subtle"
                radius="xl"
                size="lg"
                onClick={() => setToolPanelMode(toolPanelMode === 'fullscreen' ? 'sidebar' : 'fullscreen')}
                aria-label={toggleLabel}
              >
                {toolPanelMode === 'fullscreen' ? (
                  <ViewSidebarRoundedIcon fontSize="small" />
                ) : (
                  <DashboardCustomizeRoundedIcon fontSize="small" />
                )}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('toolPanel.overlay.close', 'Close')} position="bottom" withArrow>
              <ActionIcon
                variant="subtle"
                radius="xl"
                size="lg"
                onClick={handleClose}
                aria-label={t('toolPanel.overlay.close', 'Close')}
              >
                <CloseRoundedIcon fontSize="small" />
              </ActionIcon>
            </Tooltip>
          </Group>
        </header>

        <div className="tool-panel-overlay__search">
          <Group justify="space-between" align="center">
            <div className="tool-panel-overlay__search-input">
              <ToolSearch
                value={searchQuery}
                onChange={setSearchQuery}
                toolRegistry={toolRegistry}
                mode="filter"
                autoFocus
              />
            </div>
            <Badge variant="light" size="lg" radius="sm">
              {t('toolPanel.overlay.totalLabel', '{{count}} tools available', {
                count: totalToolCount,
              })}
            </Badge>
          </Group>
        </div>

        <div className="tool-panel-overlay__body">
          <ScrollArea className="tool-panel-overlay__scroll" type="always">
            {showSearchResults ? (
              <div className="tool-panel-overlay__results">
                <SearchResults
                  filteredTools={filteredTools}
                  onSelect={(id) => handleToolSelect(id as ToolId)}
                  searchQuery={searchQuery}
                />
              </div>
            ) : (
              <div className="tool-panel-overlay__picker">
                <ToolPicker
                  selectedToolKey={selectedToolKey}
                  onSelect={(id) => handleToolSelect(id as ToolId)}
                  filteredTools={filteredTools}
                  isSearching={showSearchResults}
                />
              </div>
            )}
          </ScrollArea>
        </div>
      </Paper>
    </div>
  );
}

import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import ToolPicker from './ToolPicker';
import SearchResults from './SearchResults';
import ToolRenderer from './ToolRenderer';
import ToolSearch from './toolPicker/ToolSearch';
import ToolPanelOverlay from './ToolPanelOverlay';
import { useSidebarContext } from "../../contexts/SidebarContext";
import rainbowStyles from '../../styles/rainbow.module.css';
import { ActionIcon, Group, ScrollArea, Text, Tooltip } from '@mantine/core';
import { ToolId } from '../../types/toolId';
import { useMediaQuery } from '@mantine/hooks';
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded';
import { useTranslation } from 'react-i18next';
import './ToolPanel.css';

// No props needed - component uses context

export default function ToolPanel() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef } = sidebarRefs;
  const isMobile = useMediaQuery('(max-width: 1024px)');

  const {
    leftPanelView,
    isPanelVisible,
    searchQuery,
    filteredTools,
    toolRegistry,
    setSearchQuery,
    toolPanelMode,
    setToolPanelMode,
    selectedToolKey,
    handleToolSelect,
    setPreviewFile,
  } = useToolWorkflow();

  const isFullscreenMode = toolPanelMode === 'fullscreen';
  const isCatalogActive = isFullscreenMode && leftPanelView === 'toolPicker' && !isMobile;

  const toggleLabel = isFullscreenMode
    ? t('toolPanel.modeToggle.sidebar', 'Switch to advanced sidebar')
    : t('toolPanel.modeToggle.fullscreen', 'Switch to legacy fullscreen');

  const handleToggleMode = () => {
    setToolPanelMode(isFullscreenMode ? 'sidebar' : 'fullscreen');
  };

  const reservedDesktopWidth = '8.5rem';

  const computedWidth = () => {
    if (isMobile) {
      return '100%';
    }

    if (isFullscreenMode) {
      if (isCatalogActive) {
        return `calc(100vw - ${reservedDesktopWidth})`;
      }

      if (leftPanelView === 'toolContent' && isPanelVisible) {
        return '20rem';
      }

      return isPanelVisible ? '20rem' : '0';
    }

    return isPanelVisible ? '18.5rem' : '0';
  };

  return (
    <div
      ref={toolPanelRef}
      data-sidebar="tool-panel"
      className={`tool-panel flex flex-col overflow-hidden bg-[var(--bg-toolbar)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-out ${
        isRainbowMode ? rainbowStyles.rainbowPaper : ''
      } ${isMobile ? 'h-full border-r-0' : 'h-screen'} ${isCatalogActive ? 'tool-panel--catalog' : ''}`}
      style={{
        width: computedWidth(),
        maxWidth: isCatalogActive ? `calc(100vw - ${reservedDesktopWidth})` : undefined,
        padding: '0',
      }}
    >
      <div
        style={{
          opacity: isMobile || isPanelVisible || isCatalogActive ? 1 : 0,
          transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Search Bar - Always visible at the top */}
        {!isCatalogActive && (
          <div
            className="tool-panel__search-row"
            style={{
              backgroundColor: 'var(--tool-panel-search-bg)',
              borderBottom: '1px solid var(--tool-panel-search-border-bottom)',
            }}
          >
            <ToolSearch
              value={searchQuery}
              onChange={setSearchQuery}
              toolRegistry={toolRegistry}
              mode="filter"
            />
            {!isMobile && (
              <Tooltip label={toggleLabel} position="left" withArrow>
                <ActionIcon
                  variant="subtle"
                  radius="xl"
                  color="gray"
                  onClick={handleToggleMode}
                  aria-label={toggleLabel}
                  className="tool-panel__mode-toggle"
                >
                  {isFullscreenMode ? (
                    <ViewSidebarRoundedIcon fontSize="small" />
                  ) : (
                    <DashboardCustomizeRoundedIcon fontSize="small" />
                  )}
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        )}

        {searchQuery.trim().length > 0 && !isCatalogActive ? (
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
            {isCatalogActive ? (
              <ToolPanelOverlay />
            ) : (
              <>
                {isFullscreenMode && !isMobile ? (
                  <div className="tool-panel__overlay-hint">
                    <Group gap="xs" justify="center">
                      <Text size="sm" c="dimmed">
                        {t('toolPanel.overlayHint', 'Select a tool to open it in the workspace.')}
                      </Text>
                    </Group>
                  </div>
                ) : null}
                <ToolPicker
                  selectedToolKey={selectedToolKey}
                  onSelect={(id) => handleToolSelect(id as ToolId)}
                  filteredTools={filteredTools}
                  isSearching={Boolean(searchQuery && searchQuery.trim().length > 0)}
                />
              </>
            )}
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

import React, { useEffect, useMemo } from 'react';
import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import ToolPicker from './ToolPicker';
import SearchResults from './SearchResults';
import ToolRenderer from './ToolRenderer';
import ToolSearch from './toolPicker/ToolSearch';
import { useSidebarContext } from "../../contexts/SidebarContext";
import rainbowStyles from '../../styles/rainbow.module.css';
import { ActionIcon, ScrollArea } from '@mantine/core';
import { ToolId } from '../../types/toolId';
import { useMediaQuery } from '@mantine/hooks';
import DoubleArrowIcon from '@mui/icons-material/DoubleArrow';
import { useTranslation } from 'react-i18next';
import FullscreenToolSurface from './FullscreenToolSurface';
import { useToolPanelGeometry } from '../../hooks/tools/useToolPanelGeometry';
import { useLocalStorageState } from '../../hooks/tools/useJsonLocalStorageState';
import { useRightRail } from '../../contexts/RightRailContext';
import { Tooltip } from '../shared/Tooltip';
import './ToolPanel.css';

// No props needed - component uses context

export default function ToolPanel() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef, quickAccessRef, rightRailRef } = sidebarRefs;
  const isMobile = useMediaQuery('(max-width: 1024px)');

  const {
    leftPanelView,
    isPanelVisible,
    searchQuery,
    filteredTools,
    toolRegistry,
    setSearchQuery,
    selectedToolKey,
    handleToolSelect,
    setPreviewFile,
    toolPanelMode,
    setToolPanelMode,
    setLeftPanelView,
    readerMode,
  } = useToolWorkflow();

  const { setAllRightRailButtonsDisabled } = useRightRail();

  const isFullscreenMode = toolPanelMode === 'fullscreen';
  const toolPickerVisible = !readerMode;
  const fullscreenExpanded = isFullscreenMode && leftPanelView === 'toolPicker' && !isMobile && toolPickerVisible;


  // Disable right rail buttons when fullscreen mode is active
  useEffect(() => {
    setAllRightRailButtonsDisabled(fullscreenExpanded);
  }, [fullscreenExpanded, setAllRightRailButtonsDisabled]);

  // Use custom hooks for state management
  const [showLegacyDescriptions, setShowLegacyDescriptions] = useLocalStorageState('legacyToolDescriptions', false);
  const fullscreenGeometry = useToolPanelGeometry({
    enabled: fullscreenExpanded,
    toolPanelRef,
    quickAccessRef,
    rightRailRef,
  });

  const toggleLabel = isFullscreenMode
    ? t('toolPanel.toggle.sidebar', 'Switch to sidebar mode')
    : t('toolPanel.toggle.fullscreen', 'Switch to fullscreen mode');

  const handleModeToggle = () => {
    const nextMode = isFullscreenMode ? 'sidebar' : 'fullscreen';
    setToolPanelMode(nextMode);

    if (nextMode === 'fullscreen' && leftPanelView !== 'toolPicker') {
      setLeftPanelView('toolPicker');
    }
  };

  const computedWidth = () => {
    if (isMobile) {
      return '100%';
    }

    if (!isPanelVisible) {
      return '0';
    }

    return '18.5rem';
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
      className={`tool-panel flex flex-col ${fullscreenExpanded ? 'tool-panel--fullscreen-active' : 'overflow-hidden'} bg-[var(--bg-toolbar)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-out ${
        isRainbowMode ? rainbowStyles.rainbowPaper : ''
      } ${isMobile ? 'h-full border-r-0' : 'h-screen'} ${fullscreenExpanded ? 'tool-panel--fullscreen' : ''}`}
      style={{
        width: computedWidth(),
        padding: '0'
      }}
    >
      {!fullscreenExpanded && (
        <div
          style={{
            opacity: isMobile || isPanelVisible ? 1 : 0,
            transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            className="tool-panel__search-row"
            style={{
              backgroundColor: 'var(--tool-panel-search-bg)',
              borderBottom: '1px solid var(--tool-panel-search-border-bottom)'
            }}
          >
            <ToolSearch
              value={searchQuery}
              onChange={setSearchQuery}
              toolRegistry={toolRegistry}
              mode="filter"
            />
            {!isMobile && leftPanelView === 'toolPicker' && (
              <Tooltip 
                content={toggleLabel}
                position="bottom"
                arrow={true}
                openOnFocus={false}
              >
                <ActionIcon
                  variant="subtle"
                  radius="xl"
                  style={{ color: 'var(--right-rail-icon)' }}
                  onClick={handleModeToggle}
                  aria-label={toggleLabel}
                  className="tool-panel__mode-toggle"
                >
                  <DoubleArrowIcon fontSize="small" />
                </ActionIcon>
              </Tooltip>
            )}
          </div>

                {searchQuery.trim().length > 0 ? (
                  <div className="flex-1 flex flex-col overflow-y-auto">
                    <SearchResults
                      filteredTools={filteredTools}
                      onSelect={(id) => handleToolSelect(id as ToolId)}
                      searchQuery={searchQuery}
                    />
                  </div>
                ) : leftPanelView === 'toolPicker' ? (
                  <div className="flex-1 flex flex-col overflow-auto">
                    <ToolPicker
                      selectedToolKey={selectedToolKey}
                      onSelect={(id) => handleToolSelect(id as ToolId)}
                      filteredTools={filteredTools}
                      isSearching={Boolean(searchQuery && searchQuery.trim().length > 0)}
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
                      {t('toolPanel.placeholder', 'Choose a tool to get started')}
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
          showDescriptions={showLegacyDescriptions}
          matchedTextMap={matchedTextMap}
          onSearchChange={setSearchQuery}
          onSelect={(id: ToolId) => handleToolSelect(id)}
          onToggleDescriptions={() => setShowLegacyDescriptions((prev) => !prev)}
          onExitFullscreenMode={() => setToolPanelMode('sidebar')}
          toggleLabel={toggleLabel}
          geometry={fullscreenGeometry}
        />
      )}
    </div>
  );
}

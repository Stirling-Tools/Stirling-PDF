import { useEffect, useMemo } from 'react';
import { useRainbowThemeContext } from '@app/components/shared/RainbowThemeProvider';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { usePreferences } from '@app/contexts/PreferencesContext';
import ToolPicker from '@app/components/tools/ToolPicker';
import SearchResults from '@app/components/tools/SearchResults';
import ToolRenderer from '@app/components/tools/ToolRenderer';
import ToolSearch from '@app/components/tools/toolPicker/ToolSearch';
import { useSidebarContext } from "@app/contexts/SidebarContext";
import rainbowStyles from '@app/styles/rainbow.module.css';
import { ActionIcon, ScrollArea } from '@mantine/core';
import { ToolId } from '@app/types/toolId';
import { ToolRegistryEntry } from '@app/data/toolsTaxonomy';
import { useIsMobile } from '@app/hooks/useIsMobile';
import DoubleArrowIcon from '@mui/icons-material/DoubleArrow';
import { useTranslation } from 'react-i18next';
import FullscreenToolSurface from '@app/components/tools/FullscreenToolSurface';
import { useToolPanelGeometry } from '@app/hooks/tools/useToolPanelGeometry';
import { useRightRail } from '@app/contexts/RightRailContext';
import { Tooltip } from '@app/components/shared/Tooltip';
import '@app/components/tools/ToolPanel.css';

// No props needed - component uses context

export default function ToolPanel() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef, quickAccessRef, rightRailRef } = sidebarRefs;
  const isMobile = useIsMobile();

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
  const { preferences, updatePreference } = usePreferences();

  const isFullscreenMode = toolPanelMode === 'fullscreen';
  const toolPickerVisible = !readerMode;
  const fullscreenExpanded = isFullscreenMode && leftPanelView === 'toolPicker' && !isMobile && toolPickerVisible;
  const isRTL = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';


  // Disable right rail buttons when fullscreen mode is active
  useEffect(() => {
    setAllRightRailButtonsDisabled(fullscreenExpanded);
  }, [fullscreenExpanded, setAllRightRailButtonsDisabled]);

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

  const parentFilteredTools = useMemo(
    () => filteredTools
      .filter(item => item.type === 'parent')
      .map(item => ({
        item: item.item as [ToolId, ToolRegistryEntry],
        matchedText: item.matchedText
      })),
    [filteredTools]
  );

  const matchedTextMap = useMemo(() => {
    const map = new Map<string, string>();
    parentFilteredTools.forEach(({ item, matchedText }) => {
      const [id] = item;
      if (matchedText) {
        map.set(id as string, matchedText);
      }
    });
    return map;
  }, [parentFilteredTools]);

  return (
    <div
      ref={toolPanelRef}
      data-sidebar="tool-panel"
      data-tour={fullscreenExpanded ? undefined : "tool-panel"}
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
                  <DoubleArrowIcon
                    fontSize="small"
                    style={{ transform: isRTL ? 'scaleX(-1)' : undefined }}
                  />
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
                      filteredTools={parentFilteredTools}
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
          showDescriptions={preferences.showLegacyToolDescriptions}
          matchedTextMap={matchedTextMap}
          onSearchChange={setSearchQuery}
          onSelect={(id: ToolId) => handleToolSelect(id)}
          onToggleDescriptions={() => updatePreference('showLegacyToolDescriptions', !preferences.showLegacyToolDescriptions)}
          onExitFullscreenMode={() => setToolPanelMode('sidebar')}
          toggleLabel={toggleLabel}
          geometry={fullscreenGeometry}
        />
      )}
    </div>
  );
}

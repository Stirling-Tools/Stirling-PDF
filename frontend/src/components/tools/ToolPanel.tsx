import { useEffect, useMemo, useState, useLayoutEffect } from 'react';
import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import ToolPicker from './ToolPicker';
import SearchResults from './SearchResults';
import ToolRenderer from './ToolRenderer';
import ToolSearch from './toolPicker/ToolSearch';
import { useSidebarContext } from "../../contexts/SidebarContext";
import rainbowStyles from '../../styles/rainbow.module.css';
import { ActionIcon, ScrollArea, Tooltip } from '@mantine/core';
import { ToolId } from '../../types/toolId';
import { useMediaQuery } from '@mantine/hooks';
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded';
import { useTranslation } from 'react-i18next';
import LegacyToolSurface from './LegacyToolSurface';
import './ToolPanel.css';

// No props needed - component uses context

export default function ToolPanel() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef, quickAccessRef } = sidebarRefs;
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
  } = useToolWorkflow();

  const isLegacyMode = toolPanelMode === 'legacy';
  const legacyExpanded = isLegacyMode && leftPanelView === 'toolPicker' && !isMobile;
  const [legacyGeometry, setLegacyGeometry] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const LEGACY_DESCRIPTION_STORAGE_KEY = 'legacyToolDescriptions';
  const [showLegacyDescriptions, setShowLegacyDescriptions] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const stored = window.localStorage.getItem(LEGACY_DESCRIPTION_STORAGE_KEY);
    if (stored === null) {
      return true;
    }
    return stored === 'true';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LEGACY_DESCRIPTION_STORAGE_KEY, String(showLegacyDescriptions));
  }, [showLegacyDescriptions]);

  useLayoutEffect(() => {
    if (!legacyExpanded) {
      setLegacyGeometry(null);
      return;
    }

    const panelEl = toolPanelRef.current;
    if (!panelEl) {
      setLegacyGeometry(null);
      return;
    }

    const rightRailEl = () => document.querySelector('[data-sidebar="right-rail"]') as HTMLElement | null;

    const updateGeometry = () => {
      const rect = panelEl.getBoundingClientRect();
      const rail = rightRailEl();
      const rightOffset = rail ? Math.max(0, window.innerWidth - rail.getBoundingClientRect().left) : 0;
      const width = Math.max(360, window.innerWidth - rect.left - rightOffset);
      const height = Math.max(rect.height, window.innerHeight - rect.top);
      setLegacyGeometry({
        left: rect.left,
        top: rect.top,
        width,
        height,
      });
    };

    updateGeometry();

    const handleResize = () => updateGeometry();
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateGeometry());
      resizeObserver.observe(panelEl);
      if (quickAccessRef.current) {
        resizeObserver.observe(quickAccessRef.current);
      }
      const rail = rightRailEl();
      if (rail) {
        resizeObserver.observe(rail);
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [legacyExpanded, quickAccessRef, toolPanelRef]);

  const toggleLabel = isLegacyMode
    ? t('toolPanel.toggle.sidebar', 'Switch to sidebar mode')
    : t('toolPanel.toggle.legacy', 'Switch to legacy mode');

  const handleModeToggle = () => {
    const nextMode = isLegacyMode ? 'sidebar' : 'legacy';
    setToolPanelMode(nextMode);

    if (nextMode === 'legacy' && leftPanelView !== 'toolPicker') {
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
      className={`tool-panel flex flex-col ${legacyExpanded ? 'tool-panel--legacy-active' : 'overflow-hidden'} bg-[var(--bg-toolbar)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-out ${
        isRainbowMode ? rainbowStyles.rainbowPaper : ''
      } ${isMobile ? 'h-full border-r-0' : 'h-screen'} ${legacyExpanded ? 'tool-panel--legacy' : ''}`}
      style={{
        width: computedWidth(),
        padding: '0'
      }}
    >
      {!legacyExpanded && (
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
            {!isMobile && (
              <Tooltip label={toggleLabel} position="bottom" withArrow>
                <ActionIcon
                  variant="subtle"
                  radius="xl"
                  color="gray"
                  onClick={handleModeToggle}
                  aria-label={toggleLabel}
                  className="tool-panel__mode-toggle"
                >
                  {isLegacyMode ? (
                    <ViewSidebarRoundedIcon fontSize="small" />
                  ) : (
                    <DashboardCustomizeRoundedIcon fontSize="small" />
                  )}
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

      {legacyExpanded && (
        <LegacyToolSurface
          searchQuery={searchQuery}
          toolRegistry={toolRegistry}
          filteredTools={filteredTools}
          selectedToolKey={selectedToolKey}
          showDescriptions={showLegacyDescriptions}
          matchedTextMap={matchedTextMap}
          onSearchChange={setSearchQuery}
          onSelect={(id) => handleToolSelect(id as ToolId)}
          onToggleDescriptions={() => setShowLegacyDescriptions((prev) => !prev)}
          onExitLegacyMode={() => setToolPanelMode('sidebar')}
          toggleLabel={toggleLabel}
          geometry={legacyGeometry}
        />
      )}
    </div>
  );
}

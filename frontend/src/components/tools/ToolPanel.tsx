import React from 'react';
import { useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { useToolPanelState, useToolSelection, useWorkbenchState } from '../../contexts/ToolWorkflowContext';
import ToolPicker from './ToolPicker';
import SearchResults from './SearchResults';
import ToolRenderer from './ToolRenderer';
import ToolSearch from './toolPicker/ToolSearch';
import { useSidebarContext } from "../../contexts/SidebarContext";
import rainbowStyles from '../../styles/rainbow.module.css';

// No props needed - component uses context

export default function ToolPanel() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef } = sidebarRefs;


  // Use context-based hooks to eliminate prop drilling
  const {
    leftPanelView,
    isPanelVisible,
    searchQuery,
    filteredTools,
    toolRegistry,
    setSearchQuery,
    handleBackToTools
  } = useToolPanelState();

  const { selectedToolKey, handleToolSelect } = useToolSelection();
  const { setPreviewFile } = useWorkbenchState();

  return (
    <div
      ref={toolPanelRef}
      data-sidebar="tool-panel"
      className={`h-screen flex flex-col overflow-hidden bg-[var(--bg-toolbar)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-out ${
        isRainbowMode ? rainbowStyles.rainbowPaper : ''
      }`}
      style={{width: isPanelVisible ? '20rem' : '0'}}
    >
      <div
        style={{
          opacity: isPanelVisible ? 1 : 0,
          transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Search Bar - Always visible at the top */}
        <div
          style={{
            backgroundColor: 'var(--tool-panel-search-bg)',
            padding: '0.75rem 1rem',
            marginBottom: (leftPanelView === 'toolContent') ? '1rem' : 0,
          }}
        >
          <ToolSearch
            value={searchQuery}
            onChange={setSearchQuery}
            toolRegistry={toolRegistry}
            mode="filter"
          />
        </div>

        {searchQuery.trim().length > 0 ? (
          // Searching view (replaces both picker and content)
          <div className="flex-1 flex flex-col">
            <div className="flex-1 min-h-0">
              <SearchResults
                filteredTools={filteredTools}
                onSelect={handleToolSelect}
              />
            </div>
          </div>
        ) : leftPanelView === 'toolPicker' ? (
          // Tool Picker View
          <div className="flex-1 flex flex-col">
            <ToolPicker
              selectedToolKey={selectedToolKey}
              onSelect={handleToolSelect}
              filteredTools={filteredTools}
              isSearching={Boolean(searchQuery && searchQuery.trim().length > 0)}
            />
          </div>
        ) : (
          // Selected Tool Content View
          <div className="flex-1 flex flex-col">
            {/* Tool content */}
            <div className="flex-1 min-h-0">
              {selectedToolKey && (
                <ToolRenderer
                  selectedToolKey={selectedToolKey}
                  onPreviewFile={setPreviewFile}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

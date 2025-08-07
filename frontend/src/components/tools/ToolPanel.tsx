import React, { useState } from 'react';
import { Button, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useRainbowThemeContext } from '../shared/RainbowThemeProvider';
import { ToolRegistry, ToolConfiguration } from '../../types/tool';
import ToolPicker from './ToolPicker';
import ToolRenderer from './ToolRenderer';
import rainbowStyles from '../../styles/rainbow.module.css';

interface ToolPanelProps {
  /** Whether the tool panel is visible */
  visible: boolean;
  /** Whether reader mode is active (hides the panel) */
  readerMode: boolean;
  /** Current view mode: 'toolPicker' or 'toolContent' */
  leftPanelView: 'toolPicker' | 'toolContent';
  /** Currently selected tool key */
  selectedToolKey: string | null;
  /** Selected tool configuration */
  selectedTool: ToolConfiguration | null;
  /** Tool registry with all available tools */
  toolRegistry: ToolRegistry;
  /** Handler for tool selection */
  onToolSelect: (toolId: string) => void;
  /** Handler for back to tools navigation */
  onBackToTools: () => void;
  /** Handler for file preview */
  onPreviewFile?: (file: File | null) => void;
}

export default function ToolPanel({
  visible,
  readerMode,
  leftPanelView,
  selectedToolKey,
  selectedTool,
  toolRegistry,
  onToolSelect,
  onBackToTools,
  onPreviewFile
}: ToolPanelProps) {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const [search, setSearch] = useState("");

  // Filter tools based on search
  const filteredTools = Object.entries(toolRegistry).filter(([_, { name }]) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden bg-[var(--bg-toolbar)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-out ${
        isRainbowMode ? rainbowStyles.rainbowPaper : ''
      }`}
      style={{
        width: visible && !readerMode ? '20rem' : '0',
        padding: visible && !readerMode ? '0.5rem' : '0'
      }}
    >
      <div
        style={{
          opacity: visible && !readerMode ? 1 : 0,
          transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Search Bar - Always visible at the top */}
        <div className="mb-4">
          <TextInput
            placeholder={t("toolPicker.searchPlaceholder", "Search tools...")}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            autoComplete="off"
            size="sm"
          />
        </div>

        {leftPanelView === 'toolPicker' ? (
          // Tool Picker View
          <div className="flex-1 flex flex-col">
            <ToolPicker
              selectedToolKey={selectedToolKey}
              onSelect={onToolSelect}
              filteredTools={filteredTools}
            />
          </div>
        ) : (
          // Selected Tool Content View
          <div className="flex-1 flex flex-col">
            {/* Tool content */}
            <div className="flex-1 min-h-0">
              <ToolRenderer
                selectedToolKey={selectedToolKey}
                onPreviewFile={onPreviewFile}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
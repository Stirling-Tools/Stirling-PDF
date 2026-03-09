import React, { useMemo, useState } from 'react';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { ToolId } from '@app/types/toolId';
import { filterToolRegistryByQuery } from '@app/utils/toolSearch';
import ToolPicker from '@app/components/tools/ToolPicker';
import SearchResults from '@app/components/tools/SearchResults';
import ToolSearch from '@app/components/tools/toolPicker/ToolSearch';
import { LeftSidebarToolView } from '@app/components/leftSidebar/LeftSidebarToolView';

import { RightPanelSection } from '@app/components/rightPanel/RightPanelSection';
import { AgentItem, Agent } from '@app/components/rightPanel/AgentItem';
import { ToolItem } from '@app/components/rightPanel/ToolItem';

import '@app/components/rightPanel/RightPanel.css';

// Dummy agents until real implementation
const DUMMY_AGENTS: Agent[] = [
  {
    id: 'stirling',
    name: 'Stirling',
    description: 'Your general-purpose PDF assistant',
    icon: <SmartToyRoundedIcon sx={{ fontSize: '1rem', color: 'var(--mantine-color-blue-6)' }} />,
    status: 'always-on',
    meta: 'Your general-purpose PDF assistant',
  },
  {
    id: 'data-extraction',
    name: 'Data Extraction',
    description: 'Extracts structured data from PDFs',
    icon: <DataObjectRoundedIcon sx={{ fontSize: '1rem', color: 'var(--mantine-color-blue-6)' }} />,
    status: 'running',
    meta: '203 processed · 3 min ago',
  },
  {
    id: 'advanced-redaction',
    name: 'Advanced Redaction',
    description: 'Automatically redacts sensitive info',
    icon: <AutoFixHighRoundedIcon sx={{ fontSize: '1rem', color: 'var(--mantine-color-gray-6)' }} />,
    status: 'idle',
    meta: '89 processed · Last: 1 day ago',
  },
  {
    id: 'document-generation',
    name: 'Document Generation',
    description: 'Generates documents from templates',
    icon: <ArticleRoundedIcon sx={{ fontSize: '1rem', color: 'var(--mantine-color-gray-6)' }} />,
    status: 'idle',
    meta: '45 processed · Last: 2 days ago',
  },
];

const FEATURED_TOOL_IDS: ToolId[] = ['merge', 'split', 'compress', 'convert', 'ocr', 'redact', 'compare', 'multiTool'];

export default function RightPanel() {
  const { t } = useTranslation();
  const { toolRegistry, handleToolSelect, handleBackToTools, selectedToolKey, leftPanelView } = useToolWorkflow();
  const [view, setView] = useState<'default' | 'allTools'>('default');

  const isToolContentView = Boolean(selectedToolKey) && leftPanelView === 'toolContent';
  const [searchQuery, setSearchQuery] = useState('');
  const [featuredSearchQuery, setFeaturedSearchQuery] = useState('');

  const featuredTools = useMemo(() =>
    FEATURED_TOOL_IDS
      .map((id) => ({ id, entry: toolRegistry[id] }))
      .filter(({ entry }) => Boolean(entry)),
    [toolRegistry]
  );

  const filteredTools = useMemo(
    () => filterToolRegistryByQuery(toolRegistry, searchQuery),
    [toolRegistry, searchQuery]
  );

  const featuredFilteredTools = useMemo(
    () => filterToolRegistryByQuery(toolRegistry, featuredSearchQuery),
    [toolRegistry, featuredSearchQuery]
  );

  const handleShowAllTools = () => {
    setView('allTools');
    setSearchQuery('');
  };

  const handleBack = () => {
    setView('default');
    setSearchQuery('');
  };

  if (isToolContentView) {
    return (
      <div className="right-panel right-panel--tool-mode" data-sidebar="right-panel">
        <LeftSidebarToolView
          selectedToolKey={selectedToolKey!}
          onBack={handleBackToTools}
        />
      </div>
    );
  }

  if (view === 'allTools') {
    return (
      <div className="right-panel" data-sidebar="right-panel">
        <div className="right-panel-all-tools-header">
          <button className="right-panel-back-btn" onClick={handleBack} aria-label={t('rightPanel.back', 'Back')}>
            <ArrowBackRoundedIcon sx={{ fontSize: '1rem' }} />
          </button>
          <span className="right-panel-all-tools-title">{t('rightPanel.allTools', 'All Tools')}</span>
        </div>
        <div className="right-panel-all-tools-search">
          <ToolSearch
            value={searchQuery}
            onChange={setSearchQuery}
            toolRegistry={toolRegistry}
            mode="filter"
          />
        </div>
        <div className="right-panel-all-tools-list">
          {searchQuery.trim().length > 0 ? (
            <SearchResults
              filteredTools={filteredTools}
              onSelect={(id) => handleToolSelect(id as ToolId)}
              searchQuery={searchQuery}
            />
          ) : (
            <ToolPicker
              selectedToolKey={selectedToolKey}
              onSelect={(id) => handleToolSelect(id as ToolId)}
              filteredTools={filteredTools}
              isSearching={false}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="right-panel" data-sidebar="right-panel">
      <div className="right-panel-scrollable">
        {/* Agents */}
        <RightPanelSection
          label={t('rightPanel.agents', 'Agents')}
          onViewAll={() => {}}
          viewAllLabel={t('rightPanel.viewAllAgents', 'View All Agents →')}
        >
          {DUMMY_AGENTS.map((agent) => (
            <AgentItem key={agent.id} agent={agent} />
          ))}
        </RightPanelSection>

        <div className="right-panel-divider" />

        {/* Tools */}
        <RightPanelSection
          label={t('rightPanel.tools', 'Tools')}
          onViewAll={handleShowAllTools}
          viewAllLabel={t('rightPanel.viewAllTools', 'View All Tools →')}
        >
          <div className="right-panel-tool-search">
            <input
              className="right-panel-tool-search-input"
              type="text"
              value={featuredSearchQuery}
              onChange={(e) => setFeaturedSearchQuery(e.target.value)}
              placeholder={t('rightPanel.searchTools', 'Search tools...')}
              aria-label={t('rightPanel.searchTools', 'Search tools...')}
            />
          </div>
          {featuredSearchQuery.trim().length > 0 ? (
            <SearchResults
              filteredTools={featuredFilteredTools}
              onSelect={(id) => handleToolSelect(id as ToolId)}
              searchQuery={featuredSearchQuery}
            />
          ) : (
            featuredTools.map(({ id, entry }) => (
              <ToolItem
                key={id}
                icon={entry!.icon}
                name={entry!.name}
                description={entry!.description}
                onClick={() => handleToolSelect(id)}
              />
            ))
          )}
        </RightPanelSection>
      </div>
    </div>
  );
}

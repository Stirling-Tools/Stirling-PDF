import React, { useCallback, useMemo, useState } from 'react';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useAgentChatState } from '@app/contexts/AgentChatContext';
import { ResizeHandle } from '@app/components/shared/ResizeHandle';
import { ToolId } from '@app/types/toolId';
import { filterToolRegistryByQuery } from '@app/utils/toolSearch';
import ToolPicker from '@app/components/tools/ToolPicker';
import SearchResults from '@app/components/tools/SearchResults';
import ToolSearch from '@app/components/tools/toolPicker/ToolSearch';
import { LeftSidebarToolView } from '@app/components/leftSidebar/LeftSidebarToolView';

import { RightPanelSection } from '@app/components/rightPanel/RightPanelSection';
import { AgentItem } from '@app/components/rightPanel/AgentItem';
import { ToolItem } from '@app/components/rightPanel/ToolItem';
import { AgentChat } from '@app/components/rightPanel/AgentChat';

import {
  AGENT_DEFINITIONS,
  getAgentsByCategory,
  filterAgents,
  AgentDefinition,
  AgentId,
  AGENT_MAP,
} from '@app/data/agentRegistry';

import '@app/components/rightPanel/RightPanel.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEATURED_TOOL_IDS: ToolId[] = ['merge', 'split', 'compress', 'convert', 'ocr', 'redact', 'compare', 'multiTool'];

const GENERAL_AGENT = AGENT_DEFINITIONS.find((a) => a.isGeneralAgent)!;

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

/** Default browse view: pinned general agent, categorized agents, featured tools */
function BrowseView({
  onShowAllTools,
  onShowAllAgents,
  onOpenAgent,
}: {
  onShowAllTools: () => void;
  onShowAllAgents: () => void;
  onOpenAgent: (agent: AgentDefinition) => void;
}) {
  const { t } = useTranslation();
  const { toolRegistry, handleToolSelect } = useToolWorkflow();
  const { isStreaming } = useAgentChatState();
  const [toolSearchQuery, setToolSearchQuery] = useState('');

  const agentsByCategory = useMemo(() => getAgentsByCategory(), []);

  // Only show a subset of categories on the default view
  const previewCategories = useMemo(
    () => agentsByCategory.filter((g) => g.category.id !== 'general').slice(0, 3),
    [agentsByCategory]
  );

  const featuredTools = useMemo(
    () =>
      FEATURED_TOOL_IDS
        .map((id) => ({ id, entry: toolRegistry[id] }))
        .filter(({ entry }) => Boolean(entry)),
    [toolRegistry]
  );

  const filteredTools = useMemo(
    () => filterToolRegistryByQuery(toolRegistry, toolSearchQuery),
    [toolRegistry, toolSearchQuery]
  );

  return (
    <div className="right-panel-scrollable">
      {/* ── Pinned general agent ──────────────────────── */}
      <div className="right-panel-general-agent">
        <AgentItem
          agent={GENERAL_AGENT}
          runtimeStatus={isStreaming ? 'running' : 'idle'}
          isGeneral
          onClick={() => onOpenAgent(GENERAL_AGENT)}
        />
      </div>

      <div className="right-panel-divider" />

      {/* ── Agent categories (preview) ────────────────── */}
      <RightPanelSection
        label={t('rightPanel.agents', 'Agents')}
        onViewAll={onShowAllAgents}
        viewAllLabel={t('rightPanel.viewAllAgents', 'View all →')}
      >
        {previewCategories.map((group) => (
          <div key={group.category.id} className="right-panel-agent-group">
            <div className="right-panel-agent-group-label">{group.category.label}</div>
            {group.agents.slice(0, 2).map((agent) => (
              <AgentItem
                key={agent.id}
                agent={agent}
                onClick={() => onOpenAgent(agent)}
              />
            ))}
          </div>
        ))}
      </RightPanelSection>

      <div className="right-panel-divider" />

      {/* ── Featured tools ────────────────────────────── */}
      <RightPanelSection
        label={t('rightPanel.tools', 'Tools')}
        onViewAll={onShowAllTools}
        viewAllLabel={t('rightPanel.viewAllTools', 'View all →')}
      >
        <div className="right-panel-tool-search">
          <input
            className="right-panel-tool-search-input"
            type="text"
            value={toolSearchQuery}
            onChange={(e) => setToolSearchQuery(e.target.value)}
            placeholder={t('rightPanel.searchTools', 'Search tools...')}
            aria-label={t('rightPanel.searchTools', 'Search tools...')}
          />
        </div>
        {toolSearchQuery.trim().length > 0 ? (
          <SearchResults
            filteredTools={filteredTools}
            onSelect={(id) => handleToolSelect(id as ToolId)}
            searchQuery={toolSearchQuery}
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
  );
}

/** All-agents view with search and full category listing */
function AllAgentsView({
  onBack,
  onOpenAgent,
}: {
  onBack: () => void;
  onOpenAgent: (agent: AgentDefinition) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const agentsByCategory = useMemo(() => getAgentsByCategory(), []);
  const filteredAgents = useMemo(() => filterAgents(query), [query]);
  const isSearching = query.trim().length > 0;

  return (
    <>
      <div className="right-panel-all-tools-header">
        <button className="right-panel-back-btn" onClick={onBack} aria-label={t('rightPanel.back', 'Back')}>
          <ArrowBackRoundedIcon sx={{ fontSize: '1rem' }} />
        </button>
        <span className="right-panel-all-tools-title">{t('rightPanel.allAgents', 'All Agents')}</span>
      </div>

      <div className="right-panel-agent-search-bar">
        <SearchRoundedIcon sx={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }} />
        <input
          className="right-panel-agent-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('rightPanel.searchAgents', 'Search agents...')}
          autoFocus
        />
      </div>

      <div className="right-panel-scrollable">
        {isSearching ? (
          filteredAgents.length === 0 ? (
            <div className="right-panel-empty-search">
              {t('rightPanel.noAgentsFound', 'No agents found')}
            </div>
          ) : (
            filteredAgents
              .filter((a) => !a.isGeneralAgent)
              .map((agent) => (
                <AgentItem
                  key={agent.id}
                  agent={agent}
                  onClick={() => onOpenAgent(agent)}
                />
              ))
          )
        ) : (
          agentsByCategory
            .filter((g) => g.category.id !== 'general')
            .map((group) => (
              <div key={group.category.id} className="right-panel-agent-group">
                <div className="right-panel-agent-group-label">{group.category.label}</div>
                {group.agents.map((agent) => (
                  <AgentItem
                    key={agent.id}
                    agent={agent}
                    onClick={() => onOpenAgent(agent)}
                  />
                ))}
              </div>
            ))
        )}
      </div>
    </>
  );
}

/** All-tools view (unchanged from original) */
function AllToolsView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { toolRegistry, handleToolSelect, selectedToolKey } = useToolWorkflow();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTools = useMemo(
    () => filterToolRegistryByQuery(toolRegistry, searchQuery),
    [toolRegistry, searchQuery]
  );

  return (
    <>
      <div className="right-panel-all-tools-header">
        <button className="right-panel-back-btn" onClick={onBack} aria-label={t('rightPanel.back', 'Back')}>
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Main RightPanel
// ---------------------------------------------------------------------------

type PanelView = 'default' | 'allTools' | 'allAgents' | 'agentChat';

export default function RightPanel() {
  const { selectedToolKey, leftPanelView, handleBackToTools } = useToolWorkflow();
  const [view, setView] = useState<PanelView>('default');
  const [activeAgentDef, setActiveAgentDef] = useState<AgentDefinition | null>(null);
  const [width, setWidth] = useState(280);
  const [chatWidth, setChatWidth] = useState(420);

  const isToolContentView = Boolean(selectedToolKey) && leftPanelView === 'toolContent';
  const isChat = view === 'agentChat' && activeAgentDef;
  const currentWidth = isChat ? chatWidth : width;
  const setCurrentWidth = isChat ? setChatWidth : setWidth;

  const handleOpenAgent = useCallback(
    (agent: AgentDefinition) => {
      setActiveAgentDef(agent);
      setView('agentChat');
    },
    []
  );

  const handleBackFromChat = useCallback(() => {
    setActiveAgentDef(null);
    setView('default');
  }, []);

  // Tool content mode takes priority
  if (isToolContentView) {
    return (
      <div
        className="right-panel right-panel--tool-mode"
        data-sidebar="right-panel"
        style={{ '--right-panel-width': `${width}px` } as React.CSSProperties}
      >
        <ResizeHandle side="left" currentWidth={width} minWidth={200} maxWidth={500} onResize={setWidth} />
        <LeftSidebarToolView
          selectedToolKey={selectedToolKey!}
          onBack={handleBackToTools}
        />
      </div>
    );
  }

  // Agent chat mode
  if (isChat) {
    return (
      <div
        className="right-panel right-panel--chat-expanded"
        data-sidebar="right-panel"
        style={{ '--right-panel-width': `${chatWidth}px`, '--chat-panel-width': `${chatWidth}px` } as React.CSSProperties}
      >
        <ResizeHandle side="left" currentWidth={chatWidth} minWidth={320} maxWidth={800} onResize={setChatWidth} />
        <AgentChat agent={activeAgentDef!} onBack={handleBackFromChat} />
      </div>
    );
  }

  // Browse / list views
  return (
    <div
      className="right-panel"
      data-sidebar="right-panel"
      style={{ '--right-panel-width': `${width}px` } as React.CSSProperties}
    >
      <ResizeHandle side="left" currentWidth={width} minWidth={200} maxWidth={500} onResize={setWidth} />
      {view === 'allTools' && <AllToolsView onBack={() => setView('default')} />}
      {view === 'allAgents' && <AllAgentsView onBack={() => setView('default')} onOpenAgent={handleOpenAgent} />}
      {view === 'default' && (
        <BrowseView
          onShowAllTools={() => setView('allTools')}
          onShowAllAgents={() => setView('allAgents')}
          onOpenAgent={handleOpenAgent}
        />
      )}
    </div>
  );
}

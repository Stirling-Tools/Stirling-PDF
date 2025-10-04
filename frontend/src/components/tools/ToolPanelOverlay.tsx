import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Group, ScrollArea, SegmentedControl, Text, Tooltip } from '@mantine/core';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import ToolSearch from './toolPicker/ToolSearch';
import { ToolId } from '../../types/toolId';
import { useToolSections } from '../../hooks/useToolSections';
import NoToolsFound from './shared/NoToolsFound';
import ToolPanelOverlayTile from './ToolPanelOverlayTile';
import { getSubcategoryLabel } from '../../data/toolsTaxonomy';
import './ToolPanelOverlay.css';

type LayoutVariant = 'compact' | 'detailed';

const LAYOUT_STORAGE_KEY = 'toolPanelOverlayLayout';

const getInitialLayout = (): LayoutVariant => {
  if (typeof window === 'undefined') {
    return 'detailed';
  }
  const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  return stored === 'compact' ? 'compact' : 'detailed';
};

export default function ToolPanelOverlay() {
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

  const [layout, setLayout] = useState<LayoutVariant>(getInitialLayout);

  const { sections, searchGroups } = useToolSections(filteredTools, searchQuery);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  }, [layout]);

  const showSearchResults = useMemo(() => searchQuery.trim().length > 0, [searchQuery]);
  const totalToolCount = showSearchResults ? filteredTools.length : Object.keys(toolRegistry).length;

  const matchedTextMap = useMemo(() => {
    const map = new Map<string, string>();
    filteredTools.forEach(({ item: [id], matchedText }) => {
      if (matchedText) {
        map.set(id, matchedText);
      }
    });
    return map;
  }, [filteredTools]);

  const subcategoryGroups = useMemo(() => {
    if (showSearchResults) {
      return searchGroups;
    }
    const allSection = sections.find(section => section.key === 'all');
    return allSection ? allSection.subcategories : [];
  }, [searchGroups, sections, showSearchResults]);

  const handleClose = () => {
    setSearchQuery('');
    setLeftPanelView(selectedToolKey ? 'toolContent' : 'hidden');
  };

  const toggleLabel = toolPanelMode === 'fullscreen'
    ? t('toolPanel.modeToggle.sidebar', 'Switch to advanced sidebar')
    : t('toolPanel.modeToggle.fullscreen', 'Switch to legacy fullscreen');

  const layoutLabel = t('toolPanel.overlay.layoutLabel', 'Layout');

  return (
    <div
      className="tool-panel-overlay"
      role="region"
      aria-label={t('toolPanel.overlay.title', 'All tools')}
    >
      <header className="tool-panel-overlay__header">
        <div className="tool-panel-overlay__heading">
          <Text fw={600} size="lg">
            {t('toolPanel.overlay.title', 'All tools')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('toolPanel.overlay.subtitle', 'Browse every tool in the legacy fullscreen catalog.')}
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
        <div className="tool-panel-overlay__search-input">
          <ToolSearch
            value={searchQuery}
            onChange={setSearchQuery}
            toolRegistry={toolRegistry}
            mode="filter"
            autoFocus
          />
        </div>
        <div className="tool-panel-overlay__search-controls">
          <div className="tool-panel-overlay__layout-toggle">
            <SegmentedControl
              value={layout}
              onChange={value => setLayout(value as LayoutVariant)}
              size="sm"
              aria-label={layoutLabel}
              data={[
                { label: t('toolPanel.overlay.layoutCompact', 'Compact grid'), value: 'compact' },
                { label: t('toolPanel.overlay.layoutDetailed', 'Detailed cards'), value: 'detailed' },
              ]}
            />
          </div>
          <Badge variant="light" size="lg" radius="sm">
            {t('toolPanel.overlay.totalLabel', {
              count: totalToolCount,
              defaultValue: '{{count}} tools available',
            })}
          </Badge>
        </div>
      </div>

      <div className="tool-panel-overlay__body">
        <ScrollArea className="tool-panel-overlay__scroll" offsetScrollbars>
          <div className="tool-panel-overlay__content">
            {subcategoryGroups.length === 0 ? (
              <div className="tool-panel-overlay__empty">
                <NoToolsFound />
                <Text size="sm" c="dimmed">
                  {t('toolPanel.overlayHint', 'Select a tool to open it in the workspace.')}
                </Text>
              </div>
            ) : (
              subcategoryGroups.map(({ subcategoryId, tools }) => (
                <section key={subcategoryId} className="tool-panel-overlay__section">
                  <header className="tool-panel-overlay__section-header">
                    <Text size="sm" fw={600} tt="uppercase" c="dimmed" lts={0.5}>
                      {getSubcategoryLabel(t, subcategoryId)}
                    </Text>
                    <Badge variant="outline" size="xs" radius="sm" color="gray">
                      {tools.length}
                    </Badge>
                  </header>
                  <div
                    className={`tool-panel-overlay__grid tool-panel-overlay__grid--${layout}`}
                    role="list"
                  >
                    {tools.map(({ id: toolId, tool: toolConfig }) => {
                      const matchedText = matchedTextMap.get(toolId);
                      return (
                        <ToolPanelOverlayTile
                          key={toolId}
                          id={toolId}
                          tool={toolConfig}
                          layout={layout}
                          onSelect={(nextId) => handleToolSelect(nextId as ToolId)}
                          isSelected={selectedToolKey === toolId}
                          matchedSynonym={matchedText}
                        />
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

import React, { useMemo } from 'react';
import { Badge, Text } from '@mantine/core';
import { Tooltip } from '../shared/Tooltip';
import { useTranslation } from 'react-i18next';
import { ToolRegistryEntry } from '../../data/toolsTaxonomy';
import { ToolId } from '../../types/toolId';
import { useToolSections } from '../../hooks/useToolSections';
import { getSubcategoryLabel } from '../../data/toolsTaxonomy';
import NoToolsFound from './shared/NoToolsFound';
import './ToolPanel.css';

interface LegacyToolListProps {
  filteredTools: Array<{ item: [string, ToolRegistryEntry]; matchedText?: string }>;
  searchQuery: string;
  showDescriptions: boolean;
  selectedToolKey: string | null;
  matchedTextMap: Map<string, string>;
  onSelect: (id: ToolId) => void;
}

const LegacyToolList = ({
  filteredTools,
  searchQuery,
  showDescriptions,
  selectedToolKey,
  matchedTextMap,
  onSelect,
}: LegacyToolListProps) => {
  const { t } = useTranslation();

  const { sections, searchGroups } = useToolSections(filteredTools, searchQuery);

  const tooltipPortalTarget = typeof document !== 'undefined' ? document.body : undefined;

  const subcategoryGroups = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return searchGroups;
    }
    const allSection = sections.find(section => section.key === 'all');
    return allSection ? allSection.subcategories : [];
  }, [searchGroups, sections, searchQuery]);

  if (subcategoryGroups.length === 0) {
    return (
      <div className="tool-panel__legacy-empty">
        <NoToolsFound />
        <Text size="sm" c="dimmed">
          {t('toolPanel.legacy.noResults', 'Try adjusting your search or toggle descriptions to find what you need.')}
        </Text>
      </div>
    );
  }

  const containerClass = showDescriptions
    ? 'tool-panel__legacy-groups tool-panel__legacy-groups--detailed'
    : 'tool-panel__legacy-groups tool-panel__legacy-groups--compact';

  return (
    <div className={containerClass}>
      {subcategoryGroups.map(({ subcategoryId, tools }) => (
        <section
          key={subcategoryId}
          className={`tool-panel__legacy-group ${showDescriptions ? 'tool-panel__legacy-group--detailed' : 'tool-panel__legacy-group--compact'}`}
        >
          <header className="tool-panel__legacy-section-header">
            <Text size="sm" fw={600} tt="uppercase" lts={0.5} c="dimmed">
              {getSubcategoryLabel(t, subcategoryId)}
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {tools.length}
            </Badge>
          </header>

          {showDescriptions ? (
            <div className="tool-panel__legacy-grid tool-panel__legacy-grid--detailed">
              {tools.map(({ id, tool }) => {
                const matchedText = matchedTextMap.get(id);
                const isSelected = selectedToolKey === id;
                const isDisabled = !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';

                let iconNode: React.ReactNode = null;
                if (React.isValidElement<{ style?: React.CSSProperties }>(tool.icon)) {
                  const element = tool.icon as React.ReactElement<{ style?: React.CSSProperties }>;
                  iconNode = React.cloneElement(element, {
                    style: {
                      ...(element.props.style || {}),
                      fontSize: '1.75rem',
                    },
                  });
                } else {
                  iconNode = tool.icon;
                }

                const handleClick = () => {
                  if (isDisabled) return;
                  if (tool.link) {
                    window.open(tool.link, '_blank', 'noopener,noreferrer');
                    return;
                  }
                  onSelect(id as ToolId);
                };

                return (
                  <button
                    key={id}
                    type="button"
                    className={`tool-panel__legacy-item tool-panel__legacy-item--detailed ${isSelected ? 'tool-panel__legacy-item--selected' : ''}`}
                    onClick={handleClick}
                    aria-disabled={isDisabled}
                    disabled={isDisabled}
                  >
                    {tool.icon ? (
                      <span className="tool-panel__legacy-icon" aria-hidden>
                        {iconNode}
                      </span>
                    ) : null}
                    <span className="tool-panel__legacy-body">
                      <Text fw={600} size="sm" className="tool-panel__legacy-name">
                        {tool.name}
                      </Text>
                      <Text size="sm" c="dimmed" className="tool-panel__legacy-description">
                        {tool.description}
                      </Text>
                      {matchedText && (
                        <Text size="xs" c="dimmed" className="tool-panel__legacy-match">
                          {t('toolPanel.legacy.matchedSynonym', 'Matches "{{text}}"', { text: matchedText })}
                        </Text>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="tool-panel__legacy-list">
              {tools.map(({ id, tool }) => {
                const matchedText = matchedTextMap.get(id);
                const isSelected = selectedToolKey === id;
                const isDisabled = !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';

                let iconNode: React.ReactNode = null;
                if (React.isValidElement<{ style?: React.CSSProperties }>(tool.icon)) {
                  const element = tool.icon as React.ReactElement<{ style?: React.CSSProperties }>;
                  iconNode = React.cloneElement(element, {
                    style: {
                      ...(element.props.style || {}),
                      fontSize: '1.5rem',
                    },
                  });
                } else {
                  iconNode = tool.icon;
                }

                const handleClick = () => {
                  if (isDisabled) return;
                  if (tool.link) {
                    window.open(tool.link, '_blank', 'noopener,noreferrer');
                    return;
                  }
                  onSelect(id as ToolId);
                };

                const baseButton = (
                  <button
                    type="button"
                    className={`tool-panel__legacy-list-item ${isSelected ? 'tool-panel__legacy-list-item--selected' : ''}`}
                    onClick={handleClick}
                    aria-disabled={isDisabled}
                    disabled={isDisabled}
                  >
                    {tool.icon ? (
                      <span className="tool-panel__legacy-list-icon" aria-hidden>
                        {iconNode}
                      </span>
                    ) : null}
                    <span className="tool-panel__legacy-list-body">
                      <Text fw={600} size="sm" className="tool-panel__legacy-name">
                        {tool.name}
                      </Text>
                      {matchedText && (
                        <Text size="xs" c="dimmed" className="tool-panel__legacy-match">
                          {t('toolPanel.legacy.matchedSynonym', 'Matches "{{text}}"', { text: matchedText })}
                        </Text>
                      )}
                    </span>
                  </button>
                );

                if (showDescriptions || !tool.description) {
                  return React.cloneElement(baseButton, { key: id });
                }

                return (
                  <Tooltip
                    key={id}
                    content={tool.description}
                    position="top"
                    portalTarget={tooltipPortalTarget}
                    arrow
                    delay={80}
                  >
                    {baseButton}
                  </Tooltip>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
};

export default LegacyToolList;

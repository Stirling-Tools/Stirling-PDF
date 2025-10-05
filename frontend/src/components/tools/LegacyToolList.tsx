import React, { useMemo } from 'react';
import { ActionIcon, Badge, Text } from '@mantine/core';
import { Tooltip } from '../shared/Tooltip';
import { useTranslation } from 'react-i18next';
import { ToolRegistryEntry, getSubcategoryLabel, getSubcategoryColor, getSubcategoryIcon } from '../../data/toolsTaxonomy';
import { ToolId } from '../../types/toolId';
import { useToolSections } from '../../hooks/useToolSections';
import NoToolsFound from './shared/NoToolsFound';
import { useHotkeys } from '../../contexts/HotkeyContext';
import HotkeyDisplay from '../hotkeys/HotkeyDisplay';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
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
  const { hotkeys } = useHotkeys();
  const { toolRegistry, recentTools, favoriteTools, toggleFavorite, isFavorite } = useToolWorkflow();

  const { sections, searchGroups } = useToolSections(filteredTools, searchQuery);

  const tooltipPortalTarget = typeof document !== 'undefined' ? document.body : undefined;

  // Prepare recent and favorite tool items
  const recentToolItems = useMemo(() => {
    return recentTools
      .map((toolId) => {
        const tool = toolRegistry[toolId];
        return tool ? { id: toolId, tool } : null;
      })
      .filter(Boolean)
      .slice(0, 6); // Show max 6 recent tools
  }, [recentTools, toolRegistry]);

  const favoriteToolItems = useMemo(() => {
    return favoriteTools
      .map((toolId) => {
        const tool = toolRegistry[toolId];
        return tool ? { id: toolId, tool } : null;
      })
      .filter(Boolean);
  }, [favoriteTools, toolRegistry]);

  // Show recent/favorites section only when not searching
  const showRecentFavorites = searchQuery.trim().length === 0 && (recentToolItems.length > 0 || favoriteToolItems.length > 0);

  const subcategoryGroups = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return searchGroups;
    }
    const allSection = sections.find(section => section.key === 'all');
    return allSection ? allSection.subcategories : [];
  }, [searchGroups, sections, searchQuery]);

  if (subcategoryGroups.length === 0 && !showRecentFavorites) {
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

  // Helper function to render a tool item
  const renderToolItem = (id: string, tool: ToolRegistryEntry) => {
    const matchedText = matchedTextMap.get(id);
    const isSelected = selectedToolKey === id;
    const isDisabled = !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';
    const binding = hotkeys[id];
    const isFav = isFavorite(id as ToolId);
    const categoryColor = getSubcategoryColor(tool.subcategoryId);

    let iconNode: React.ReactNode = null;
    if (React.isValidElement<{ style?: React.CSSProperties }>(tool.icon)) {
      const element = tool.icon as React.ReactElement<{ style?: React.CSSProperties }>;
      iconNode = React.cloneElement(element, {
        style: {
          ...(element.props.style || {}),
          fontSize: showDescriptions ? '1.75rem' : '1.5rem',
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

    const handleStarClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFavorite(id as ToolId);
    };

    // Detailed view
    if (showDescriptions) {
      return (
        <button
          key={id}
          type="button"
          className={`tool-panel__legacy-item tool-panel__legacy-item--detailed ${isSelected ? 'tool-panel__legacy-item--selected' : ''} tool-panel__legacy-item--with-star`}
          onClick={handleClick}
          aria-disabled={isDisabled}
          disabled={isDisabled}
        >
          {tool.icon ? (
            <span
              className="tool-panel__legacy-icon"
              aria-hidden
              style={{
                background: `linear-gradient(135deg,
                  color-mix(in srgb, ${categoryColor} 18%, var(--legacy-bg-icon-detailed)),
                  color-mix(in srgb, ${categoryColor} 8%, var(--legacy-bg-icon-detailed))
                )`,
                color: categoryColor
              }}
            >
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
            {binding && (
              <div className="tool-panel__legacy-shortcut">
                <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem' }}>
                  {t('settings.hotkeys.shortcut', 'Shortcut')}
                </span>
                <HotkeyDisplay binding={binding} size="sm" />
              </div>
            )}
            {matchedText && (
              <Text size="xs" c="dimmed" className="tool-panel__legacy-match">
                {t('toolPanel.legacy.matchedSynonym', 'Matches "{{text}}"', { text: matchedText })}
              </Text>
            )}
          </span>
          {!isDisabled && (
            <ActionIcon
              variant="subtle"
              radius="xl"
              size="sm"
              onClick={handleStarClick}
              className="tool-panel__legacy-star"
              aria-label={isFav ? t('toolPanel.legacy.unfavorite', 'Remove from favourites') : t('toolPanel.legacy.favorite', 'Add to favourites')}
            >
              {isFav ? (
                <StarRoundedIcon fontSize="small" style={{ color: '#FFC107' }} />
              ) : (
                <StarBorderRoundedIcon fontSize="small" />
              )}
            </ActionIcon>
          )}
        </button>
      );
    }

    // Compact view
    const compactButton = (
      <button
        key={id}
        type="button"
        className={`tool-panel__legacy-list-item ${isSelected ? 'tool-panel__legacy-list-item--selected' : ''} ${!isDisabled ? 'tool-panel__legacy-list-item--with-star' : ''}`}
        onClick={handleClick}
        aria-disabled={isDisabled}
        disabled={isDisabled}
      >
        {tool.icon ? (
          <span
            className="tool-panel__legacy-list-icon"
            aria-hidden
            style={{
              background: `linear-gradient(135deg,
                color-mix(in srgb, ${categoryColor} 15%, var(--legacy-bg-icon-compact)),
                color-mix(in srgb, ${categoryColor} 6%, var(--legacy-bg-icon-compact))
              )`,
              color: categoryColor
            }}
          >
            {iconNode}
          </span>
        ) : null}
        <span className="tool-panel__legacy-list-body">
          <Text fw={600} size="sm" className="tool-panel__legacy-name">
            {tool.name}
          </Text>
          {matchedText && (
            <Text size="xs" c="dimmed" className="tool-panel__legacy-match">
              {t('toolPanel.legacy.matchedSynonym', 'Matches "{{text}}"', { text: matchedText})}
            </Text>
          )}
        </span>
        {!isDisabled && (
          <ActionIcon
            variant="subtle"
            radius="xl"
            size="xs"
            onClick={handleStarClick}
            className="tool-panel__legacy-star-compact"
            aria-label={isFav ? t('toolPanel.legacy.unfavorite', 'Remove from favourites') : t('toolPanel.legacy.favorite', 'Add to favourites')}
          >
            {isFav ? (
              <StarRoundedIcon fontSize="inherit" style={{ color: '#FFC107', fontSize: '1rem' }} />
            ) : (
              <StarBorderRoundedIcon fontSize="inherit" style={{ fontSize: '1rem' }} />
            )}
          </ActionIcon>
        )}
      </button>
    );

    const tooltipContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span>{tool.description}</span>
        {binding && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--mantine-color-dimmed)', fontWeight: 500 }}>
              {t('settings.hotkeys.shortcut', 'Shortcut')}
            </span>
            <HotkeyDisplay binding={binding} />
          </div>
        )}
      </div>
    );

    return (
      <Tooltip
        key={id}
        content={tooltipContent}
        position="top"
        portalTarget={tooltipPortalTarget}
        arrow
        delay={80}
      >
        {compactButton}
      </Tooltip>
    );
  };

  return (
    <div className={containerClass}>
      {showRecentFavorites && (
        <>
          {favoriteToolItems.length > 0 && (
            <section className="tool-panel__legacy-group tool-panel__legacy-group--special">
              <header className="tool-panel__legacy-section-header">
                <div className="tool-panel__legacy-section-title">
                  <span className="tool-panel__legacy-section-icon" style={{ color: '#FFC107' }} aria-hidden>
                    <StarRoundedIcon />
                  </span>
                  <Text size="sm" fw={600} tt="uppercase" lts={0.5} c="dimmed">
                    {t('toolPanel.legacy.favorites', 'Favourites')}
                  </Text>
                </div>
                <Badge size="sm" variant="light" color="yellow">
                  {favoriteToolItems.length}
                </Badge>
              </header>
              {showDescriptions ? (
                <div className="tool-panel__legacy-grid tool-panel__legacy-grid--detailed">
                  {favoriteToolItems.map((item: any) => renderToolItem(item.id, item.tool))}
                </div>
              ) : (
                <div className="tool-panel__legacy-list">
                  {favoriteToolItems.map((item: any) => renderToolItem(item.id, item.tool))}
                </div>
              )}
            </section>
          )}

          {recentToolItems.length > 0 && (
            <section className="tool-panel__legacy-group tool-panel__legacy-group--special">
              <header className="tool-panel__legacy-section-header">
                <div className="tool-panel__legacy-section-title">
                  <span className="tool-panel__legacy-section-icon" style={{ color: '#1BB1D4' }} aria-hidden>
                    <HistoryRoundedIcon />
                  </span>
                  <Text size="sm" fw={600} tt="uppercase" lts={0.5} c="dimmed">
                    {t('toolPanel.legacy.recent', 'Recently used')}
                  </Text>
                </div>
                <Badge size="sm" variant="light" color="cyan">
                  {recentToolItems.length}
                </Badge>
              </header>
              {showDescriptions ? (
                <div className="tool-panel__legacy-grid tool-panel__legacy-grid--detailed">
                  {recentToolItems.map((item: any) => renderToolItem(item.id, item.tool))}
                </div>
              ) : (
                <div className="tool-panel__legacy-list">
                  {recentToolItems.map((item: any) => renderToolItem(item.id, item.tool))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {subcategoryGroups.map(({ subcategoryId, tools }) => {
        const categoryColor = getSubcategoryColor(subcategoryId);

        return (
          <section
            key={subcategoryId}
            className={`tool-panel__legacy-group ${showDescriptions ? 'tool-panel__legacy-group--detailed' : 'tool-panel__legacy-group--compact'}`}
            style={{
              borderColor: `color-mix(in srgb, ${categoryColor} 25%, var(--legacy-border-subtle-65))`,
            }}
          >
            <header className="tool-panel__legacy-section-header">
              <div className="tool-panel__legacy-section-title">
                <span
                  className="tool-panel__legacy-section-icon"
                  style={{ color: categoryColor }}
                  aria-hidden
                >
                  {getSubcategoryIcon(subcategoryId)}
                </span>
                <Text size="sm" fw={600} tt="uppercase" lts={0.5} style={{ color: categoryColor }}>
                  {getSubcategoryLabel(t, subcategoryId)}
                </Text>
              </div>
              <Badge size="sm" variant="light" style={{
                backgroundColor: `color-mix(in srgb, ${categoryColor} 15%, transparent)`,
                color: categoryColor,
                borderColor: `color-mix(in srgb, ${categoryColor} 30%, transparent)`
              }}>
                {tools.length}
              </Badge>
            </header>

            {showDescriptions ? (
              <div className="tool-panel__legacy-grid tool-panel__legacy-grid--detailed">
                {tools.map(({ id, tool }) => renderToolItem(id, tool))}
              </div>
            ) : (
              <div className="tool-panel__legacy-list">
                {tools.map(({ id, tool }) => renderToolItem(id, tool))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default LegacyToolList;

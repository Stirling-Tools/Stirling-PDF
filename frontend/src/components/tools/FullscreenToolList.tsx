import React, { useMemo } from 'react';
import { ActionIcon, Text } from '@mantine/core';
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
import ThumbUpRoundedIcon from '@mui/icons-material/ThumbUpRounded';
import Badge from '../shared/Badge';
import './ToolPanel.css';

interface FullscreenToolListProps {
  filteredTools: Array<{ item: [string, ToolRegistryEntry]; matchedText?: string }>;
  searchQuery: string;
  showDescriptions: boolean;
  selectedToolKey: string | null;
  matchedTextMap: Map<string, string>;
  onSelect: (id: ToolId) => void;
}

const FullscreenToolList = ({
  filteredTools,
  searchQuery,
  showDescriptions,
  selectedToolKey,
  matchedTextMap,
  onSelect,
}: FullscreenToolListProps) => {
  const { t } = useTranslation();
  const { hotkeys } = useHotkeys();
  const { toolRegistry, favoriteTools, toggleFavorite, isFavorite } = useToolWorkflow();

  const { sections, searchGroups } = useToolSections(filteredTools, searchQuery);

  const tooltipPortalTarget = typeof document !== 'undefined' ? document.body : undefined;


  const favoriteToolItems = useMemo(() => {
    return favoriteTools
      .map((toolId) => {
        const tool = toolRegistry[toolId];
        return tool ? { id: toolId, tool } : null;
      })
      .filter(Boolean);
  }, [favoriteTools, toolRegistry]);

  const quickSection = useMemo(() => sections.find(section => section.key === 'quick'), [sections]);
  const recommendedItems = useMemo(() => {
    if (!quickSection) return [] as Array<{ id: string, tool: ToolRegistryEntry }>;
    const items: Array<{ id: string, tool: ToolRegistryEntry }> = [];
    quickSection.subcategories.forEach(sc => sc.tools.forEach(t => items.push(t)));
    return items.slice(0, 5);
  }, [quickSection]);

  // Show recommended/favorites section only when not searching
  const showRecentFavorites = searchQuery.trim().length === 0 && ((recommendedItems.length > 0) || favoriteToolItems.length > 0);

  const subcategoryGroups = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return searchGroups;
    }
    const allSection = sections.find(section => section.key === 'all');
    return allSection ? allSection.subcategories : [];
  }, [searchGroups, sections, searchQuery]);

  if (subcategoryGroups.length === 0 && !showRecentFavorites) {
    return (
      <div className="tool-panel__fullscreen-empty">
        <NoToolsFound />
        <Text size="sm" c="dimmed">
          {t('toolPanel.fullscreen.noResults', 'Try adjusting your search or toggle descriptions to find what you need.')}
        </Text>
      </div>
    );
  }

  const containerClass = showDescriptions
    ? 'tool-panel__fullscreen-groups tool-panel__fullscreen-groups--detailed'
    : 'tool-panel__fullscreen-groups tool-panel__fullscreen-groups--compact';

  const getItemClasses = (isDetailed: boolean) => {
    const base = isDetailed ? 'tool-panel__fullscreen-item--detailed' : '';
    return base;
  };

  const getIconBackground = (categoryColor: string, isDetailed: boolean) => {
    const baseColor = isDetailed ? 'var(--fullscreen-bg-icon-detailed)' : 'var(--fullscreen-bg-icon-compact)';
    const blend1 = isDetailed ? '18%' : '15%';
    const blend2 = isDetailed ? '8%' : '6%';

    return `linear-gradient(135deg,
      color-mix(in srgb, ${categoryColor} ${blend1}, ${baseColor}),
      color-mix(in srgb, ${categoryColor} ${blend2}, ${baseColor})
    )`;
  };

  const getIconStyle = () => {
    return {};
  };

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
      const iconBg = getIconBackground(categoryColor, true);
      const iconClasses = 'tool-panel__fullscreen-icon';

          return (
            <button
              key={id}
              type="button"
              className={`tool-panel__fullscreen-item ${getItemClasses(true)} ${isSelected ? 'tool-panel__fullscreen-item--selected' : ''} tool-panel__fullscreen-item--with-star`}
              onClick={handleClick}
              aria-disabled={isDisabled}
              disabled={isDisabled}
            >
          {tool.icon ? (
            <span
              className={iconClasses}
              aria-hidden
              style={{
                background: iconBg,
                ...getIconStyle(),
              }}
            >
              {iconNode}
            </span>
          ) : null}
          <span className="tool-panel__fullscreen-body">
            <Text fw={600} size="sm" className="tool-panel__fullscreen-name">
              {tool.name}
            </Text>
            <Text size="sm" c="dimmed" className="tool-panel__fullscreen-description">
              {tool.description}
            </Text>
            {binding && (
              <div className="tool-panel__fullscreen-shortcut">
                <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem' }}>
                  {t('settings.hotkeys.shortcut', 'Shortcut')}
                </span>
                <HotkeyDisplay binding={binding} size="sm" />
              </div>
            )}
            {matchedText && (
              <Text size="xs" c="dimmed" className="tool-panel__fullscreen-match">
                {t('toolPanel.fullscreen.matchedSynonym', 'Matches "{{text}}"', { text: matchedText })}
              </Text>
            )}
          </span>
          {!isDisabled && (
            <ActionIcon
              variant="subtle"
              radius="xl"
              size="sm"
              onClick={handleStarClick}
              className="tool-panel__fullscreen-star"
              aria-label={isFav ? t('toolPanel.fullscreen.unfavorite', 'Remove from favourites') : t('toolPanel.fullscreen.favorite', 'Add to favourites')}
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
    const iconBg = getIconBackground(categoryColor, false);
    const iconClasses = 'tool-panel__fullscreen-list-icon';

        const compactButton = (
          <button
            key={id}
            type="button"
            className={`tool-panel__fullscreen-list-item ${getItemClasses(false)} ${isSelected ? 'tool-panel__fullscreen-list-item--selected' : ''} ${!isDisabled ? 'tool-panel__fullscreen-list-item--with-star' : ''}`}
            onClick={handleClick}
            aria-disabled={isDisabled}
            disabled={isDisabled}
          >
        {tool.icon ? (
          <span
            className={iconClasses}
            aria-hidden
            style={{
              background: iconBg,
              ...getIconStyle(),
            }}
          >
            {iconNode}
          </span>
        ) : null}
        <span className="tool-panel__fullscreen-list-body">
          <Text fw={600} size="sm" className="tool-panel__fullscreen-name">
            {tool.name}
          </Text>
          {matchedText && (
            <Text size="xs" c="dimmed" className="tool-panel__fullscreen-match">
              {t('toolPanel.fullscreen.matchedSynonym', 'Matches "{{text}}"', { text: matchedText})}
            </Text>
          )}
        </span>
        {!isDisabled && (
          <ActionIcon
            variant="subtle"
            radius="xl"
            size="xs"
            onClick={handleStarClick}
            className="tool-panel__fullscreen-star-compact"
            aria-label={isFav ? t('toolPanel.fullscreen.unfavorite', 'Remove from favourites') : t('toolPanel.fullscreen.favorite', 'Add to favourites')}
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

    const tooltipContent = isDisabled
      ? (
        <span><strong>{t('toolPanel.fullscreen.comingSoon', 'Coming soon:')}</strong> {tool.description}</span>
      )
      : (
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
            <section 
              className="tool-panel__fullscreen-group tool-panel__fullscreen-group--special"
              style={{
                borderColor: 'var(--fullscreen-border-favorites)',
              }}
            >
              <header className="tool-panel__fullscreen-section-header">
                <div className="tool-panel__fullscreen-section-title">
                  <span
                    className="tool-panel__fullscreen-section-icon"
                    style={{
                      color: 'var(--special-color-favorites)',
                    }}
                    aria-hidden
                  >
                    <StarRoundedIcon />
                  </span>
                  <Text size="sm" fw={600} tt="uppercase" lts={0.5} c="dimmed">
                    {t('toolPanel.fullscreen.favorites', 'Favourites')}
                  </Text>
                </div>
                <Badge
                  size="sm"
                  variant="colored"
                  color="var(--special-color-favorites)"
                >
                  {favoriteToolItems.length}
                </Badge>
              </header>
              {showDescriptions ? (
                <div className="tool-panel__fullscreen-grid tool-panel__fullscreen-grid--detailed">
                  {favoriteToolItems.map((item: any) => renderToolItem(item.id, item.tool))}
                </div>
              ) : (
                <div className="tool-panel__fullscreen-list">
                  {favoriteToolItems.map((item: any) => renderToolItem(item.id, item.tool))}
                </div>
              )}
            </section>
          )}

          {recommendedItems.length > 0 && (
            <section 
              className="tool-panel__fullscreen-group tool-panel__fullscreen-group--special"
              style={{
                borderColor: 'var(--fullscreen-border-recommended)',
              }}
            >
              <header className="tool-panel__fullscreen-section-header">
                <div className="tool-panel__fullscreen-section-title">
                  <span
                    className="tool-panel__fullscreen-section-icon"
                    style={{
                      color: 'var(--special-color-recommended)',
                    }}
                    aria-hidden
                  >
                    <ThumbUpRoundedIcon />
                  </span>
                  <Text size="sm" fw={600} tt="uppercase" lts={0.5} c="dimmed">
                    {t('toolPanel.fullscreen.recommended', 'Recommended')}
                  </Text>
                </div>
                <Badge
                  size="sm"
                  variant="colored"
                  color="var(--special-color-recommended)"
                >
                  {recommendedItems.length}
                </Badge>
              </header>
              {showDescriptions ? (
                <div className="tool-panel__fullscreen-grid tool-panel__fullscreen-grid--detailed">
                  {recommendedItems.map((item: any) => renderToolItem(item.id, item.tool))}
                </div>
              ) : (
                <div className="tool-panel__fullscreen-list">
                  {recommendedItems.map((item: any) => renderToolItem(item.id, item.tool))}
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
            className={`tool-panel__fullscreen-group ${showDescriptions ? 'tool-panel__fullscreen-group--detailed' : 'tool-panel__fullscreen-group--compact'}`}
            style={{
              borderColor: `color-mix(in srgb, ${categoryColor} 25%, var(--fullscreen-border-subtle-65))`,
            }}
          >
            <header className="tool-panel__fullscreen-section-header">
              <div className="tool-panel__fullscreen-section-title">
                <span
                  className="tool-panel__fullscreen-section-icon"
                  style={{
                    color: categoryColor,
                  }}
                  aria-hidden
                >
                  {getSubcategoryIcon(subcategoryId)}
                </span>
                <Text
                  size="sm"
                  fw={600}
                  tt="uppercase"
                  lts={0.5}
                  style={{
                    color: categoryColor,
                  }}
                >
                  {getSubcategoryLabel(t, subcategoryId)}
                </Text>
              </div>
              <Badge
                size="sm"
                variant="colored"
                color={categoryColor}
              >
                {tools.length}
              </Badge>
            </header>

            {showDescriptions ? (
              <div className="tool-panel__fullscreen-grid tool-panel__fullscreen-grid--detailed">
                {tools.map(({ id, tool }) => renderToolItem(id, tool))}
              </div>
            ) : (
              <div className="tool-panel__fullscreen-list">
                {tools.map(({ id, tool }) => renderToolItem(id, tool))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default FullscreenToolList;



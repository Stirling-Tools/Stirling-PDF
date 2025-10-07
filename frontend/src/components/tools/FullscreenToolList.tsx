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
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
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
  const { toolRegistry, recentTools, favoriteTools, toggleFavorite, isFavorite, fullscreenToolSettings } = useToolWorkflow();

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
    const border = fullscreenToolSettings.toolItemBorder === 'hidden' ? 'tool-panel__fullscreen-item--no-border' : '';
    const hover = `tool-panel__fullscreen-item--hover-${fullscreenToolSettings.hoverIntensity}`;
    return [base, border, hover].filter(Boolean).join(' ');
  };

  const getIconBackground = (categoryColor: string, isDetailed: boolean) => {
    if (fullscreenToolSettings.iconBackground === 'none' || fullscreenToolSettings.iconBackground === 'hover') {
      return 'transparent';
    }

    const baseColor = isDetailed ? 'var(--fullscreen-bg-icon-detailed)' : 'var(--fullscreen-bg-icon-compact)';
    const blend1 = isDetailed ? '18%' : '15%';
    const blend2 = isDetailed ? '8%' : '6%';

    return `linear-gradient(135deg,
      color-mix(in srgb, ${categoryColor} ${blend1}, ${baseColor}),
      color-mix(in srgb, ${categoryColor} ${blend2}, ${baseColor})
    )`;
  };

  const getIconStyle = () => {
    if (fullscreenToolSettings.iconColorScheme === 'monochrome') {
      return { filter: 'grayscale(1) opacity(0.8)' };
    }
    if (fullscreenToolSettings.iconColorScheme === 'vibrant') {
      return { filter: 'saturate(1.5) brightness(1.1)' };
    }
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
      const iconClasses = fullscreenToolSettings.iconBackground === 'hover'
        ? 'tool-panel__fullscreen-icon tool-panel__fullscreen-icon--hover-bg'
        : 'tool-panel__fullscreen-icon';

      const hoverBgDetailed = fullscreenToolSettings.iconBackground === 'hover'
        ? `linear-gradient(135deg,
            color-mix(in srgb, ${categoryColor} 18%, var(--fullscreen-bg-icon-detailed)),
            color-mix(in srgb, ${categoryColor} 8%, var(--fullscreen-bg-icon-detailed))
          )`
        : undefined;

          return (
            <button
              key={id}
              type="button"
              className={`tool-panel__fullscreen-item ${getItemClasses(true)} ${isSelected ? 'tool-panel__fullscreen-item--selected' : ''} tool-panel__fullscreen-item--with-star`}
              onClick={handleClick}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              style={{
                ['--fullscreen-icon-hover-bg' as any]: hoverBgDetailed,
              }}
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
    const iconClasses = fullscreenToolSettings.iconBackground === 'hover'
      ? 'tool-panel__fullscreen-list-icon tool-panel__fullscreen-list-icon--hover-bg'
      : 'tool-panel__fullscreen-list-icon';

    const hoverBgCompact = fullscreenToolSettings.iconBackground === 'hover'
      ? `linear-gradient(135deg,
          color-mix(in srgb, ${categoryColor} 15%, var(--fullscreen-bg-icon-compact)),
          color-mix(in srgb, ${categoryColor} 6%, var(--fullscreen-bg-icon-compact))
        )`
      : undefined;

        const compactButton = (
          <button
            key={id}
            type="button"
            className={`tool-panel__fullscreen-list-item ${getItemClasses(false)} ${isSelected ? 'tool-panel__fullscreen-list-item--selected' : ''} ${!isDisabled ? 'tool-panel__fullscreen-list-item--with-star' : ''}`}
            onClick={handleClick}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            style={{
              ['--fullscreen-icon-hover-bg' as any]: hoverBgCompact,
            }}
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
            <section className="tool-panel__fullscreen-group tool-panel__fullscreen-group--special">
              <header className="tool-panel__fullscreen-section-header">
                <div className="tool-panel__fullscreen-section-title">
                  <span
                    className="tool-panel__fullscreen-section-icon"
                    style={{
                      color: fullscreenToolSettings.headerIconColor === 'colored' ? '#FFC107' : 'var(--mantine-color-dimmed)',
                      ...getIconStyle(),
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
                  variant={fullscreenToolSettings.headerBadgeColor === 'colored' ? 'colored' : 'default'}
                  color={fullscreenToolSettings.headerBadgeColor === 'colored' ? '#FFC107' : undefined}
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

          {recentToolItems.length > 0 && (
            <section className="tool-panel__fullscreen-group tool-panel__fullscreen-group--special">
              <header className="tool-panel__fullscreen-section-header">
                <div className="tool-panel__fullscreen-section-title">
                  <span
                    className="tool-panel__fullscreen-section-icon"
                    style={{
                      color: fullscreenToolSettings.headerIconColor === 'colored' ? '#1BB1D4' : 'var(--mantine-color-dimmed)',
                      ...getIconStyle(),
                    }}
                    aria-hidden
                  >
                    <HistoryRoundedIcon />
                  </span>
                  <Text size="sm" fw={600} tt="uppercase" lts={0.5} c="dimmed">
                    {t('toolPanel.fullscreen.recent', 'Recently used')}
                  </Text>
                </div>
                <Badge
                  size="sm"
                  variant={fullscreenToolSettings.headerBadgeColor === 'colored' ? 'colored' : 'default'}
                  color={fullscreenToolSettings.headerBadgeColor === 'colored' ? '#1BB1D4' : undefined}
                >
                  {recentToolItems.length}
                </Badge>
              </header>
              {showDescriptions ? (
                <div className="tool-panel__fullscreen-grid tool-panel__fullscreen-grid--detailed">
                  {recentToolItems.map((item: any) => renderToolItem(item.id, item.tool))}
                </div>
              ) : (
                <div className="tool-panel__fullscreen-list">
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
                    color: fullscreenToolSettings.sectionTitleColor === 'colored' ? categoryColor : 'var(--mantine-color-dimmed)',
                    ...getIconStyle(),
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
                    color: fullscreenToolSettings.sectionTitleColor === 'colored' ? categoryColor : undefined,
                  }}
                  c={fullscreenToolSettings.sectionTitleColor === 'neutral' ? 'dimmed' : undefined}
                >
                  {getSubcategoryLabel(t, subcategoryId)}
                </Text>
              </div>
              <Badge
                size="sm"
                variant={fullscreenToolSettings.sectionTitleColor === 'colored' ? 'colored' : 'default'}
                color={fullscreenToolSettings.sectionTitleColor === 'colored' ? categoryColor : undefined}
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



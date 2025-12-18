import { useMemo } from 'react';
import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ToolRegistryEntry, getSubcategoryLabel, getSubcategoryColor, getSubcategoryIcon } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';
import { useToolSections } from '@app/hooks/useToolSections';
import NoToolsFound from '@app/components/tools/shared/NoToolsFound';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import LocalIcon from '@app/components/shared/LocalIcon';
import Badge from '@app/components/shared/Badge';
import '@app/components/tools/ToolPanel.css';
import DetailedToolItem from '@app/components/tools/fullscreen/DetailedToolItem';
import CompactToolItem from '@app/components/tools/fullscreen/CompactToolItem';
import { useFavoriteToolItems } from '@app/hooks/tools/useFavoriteToolItems';

interface FullscreenToolListProps {
  filteredTools: Array<{ item: [ToolId, ToolRegistryEntry]; matchedText?: string }>;
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
  matchedTextMap: _matchedTextMap,
  onSelect,
}: FullscreenToolListProps) => {
  const { t } = useTranslation();
  const { toolRegistry, favoriteTools } = useToolWorkflow();

  const { sections, searchGroups } = useToolSections(filteredTools, searchQuery);

  const tooltipPortalTarget = typeof document !== 'undefined' ? document.body : undefined;


  const favoriteToolItems = useFavoriteToolItems(favoriteTools, toolRegistry);

  const quickSection = useMemo(() => sections.find(section => section.key === 'quick'), [sections]);
  const recommendedItems = useMemo(() => {
    if (!quickSection) return [] as Array<{ id: string, tool: ToolRegistryEntry }>;
    const items: Array<{ id: string, tool: ToolRegistryEntry }> = [];
    quickSection.subcategories.forEach(sc => sc.tools.forEach(t => items.push(t)));
    return items;
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

  // Helper function to render a tool item
  const renderToolItem = (id: ToolId, tool: ToolRegistryEntry) => {
    const isSelected = selectedToolKey === id;

    const handleClick = () => {
      if (!tool.component && !tool.link && id !== 'read' && id !== 'multiTool') return;
      if (tool.link) {
        window.open(tool.link, '_blank', 'noopener,noreferrer');
        return;
      }
      onSelect(id as ToolId);
    };

    if (showDescriptions) {
      return (
        <DetailedToolItem key={id} id={id} tool={tool} isSelected={isSelected} onClick={handleClick} />
      );
    }

    return (
      <CompactToolItem key={id} id={id} tool={tool} isSelected={isSelected} onClick={handleClick} tooltipPortalTarget={tooltipPortalTarget} />
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
                    <LocalIcon icon="star-rounded" width={24} height={24} />
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
                  {favoriteToolItems.map((item) => item && renderToolItem(item.id, item.tool))}
                </div>
              ) : (
                <div className="tool-panel__fullscreen-list">
                  {favoriteToolItems.map((item) => item && renderToolItem(item.id, item.tool))}
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
                    <LocalIcon icon="thumb-up-rounded" width={24} height={24} />
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
                {tools.map(({ id, tool }) => renderToolItem(id as ToolId, tool))}
              </div>
            ) : (
              <div className="tool-panel__fullscreen-list">
                {tools.map(({ id, tool }) => renderToolItem(id as ToolId, tool))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default FullscreenToolList;



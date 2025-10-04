import React, { useMemo } from 'react';
import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ToolRegistryEntry } from '../../data/toolsTaxonomy';
import { Tooltip } from '../shared/Tooltip';
import { useToolNavigation } from '../../hooks/useToolNavigation';
import { handleUnlessSpecialClick } from '../../utils/clickHandlers';
import { useHotkeys } from '../../contexts/HotkeyContext';
import HotkeyDisplay from '../hotkeys/HotkeyDisplay';

interface ToolPanelOverlayTileProps {
  id: string;
  tool: ToolRegistryEntry;
  layout: 'compact' | 'detailed';
  onSelect: (id: string) => void;
  isSelected: boolean;
  matchedSynonym?: string;
}

const ToolPanelOverlayTile: React.FC<ToolPanelOverlayTileProps> = ({
  id,
  tool,
  layout,
  onSelect,
  isSelected,
  matchedSynonym,
}) => {
  const { t } = useTranslation();
  const { getToolNavigation } = useToolNavigation();
  const { hotkeys } = useHotkeys();

  const isUnavailable = !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';
  const binding = hotkeys[id];

  const navProps = !isUnavailable && !tool.link ? getToolNavigation(id, tool) : null;

  const tooltipContent = useMemo(() => {
    if (layout !== 'compact') {
      return null;
    }

    return (
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
  }, [binding, layout, t, tool.description]);

  const iconNode = useMemo(() => {
    if (!tool.icon) {
      return null;
    }

    if (React.isValidElement(tool.icon)) {
      const existingStyle = (tool.icon.props as { style?: React.CSSProperties }).style || {};
      return React.cloneElement(tool.icon, {
        style: {
          ...existingStyle,
          fontSize: layout === 'compact' ? '1.75rem' : '2rem',
        },
      });
    }

    return tool.icon;
  }, [layout, tool.icon]);

  const handleSelect = () => {
    if (isUnavailable) return;
    if (tool.link) {
      window.open(tool.link, '_blank', 'noopener,noreferrer');
      return;
    }
    onSelect(id);
  };

  const handleButtonClick = (event: React.MouseEvent) => {
    handleUnlessSpecialClick(event, handleSelect);
  };

  const matchedLine = matchedSynonym
    ? t('toolPanel.overlay.matchedSynonym', 'Matches "{{text}}"', { text: matchedSynonym })
    : null;

  const content = (
    <div
      className="tool-panel-overlay__tile"
      data-variant={layout}
      data-selected={isSelected}
      data-disabled={isUnavailable || undefined}
    >
      <div className="tool-panel-overlay__tile-icon" aria-hidden>
        {iconNode}
      </div>
      <div className="tool-panel-overlay__tile-body">
        <Text fw={600} size="sm" className="tool-panel-overlay__tile-name">
          {tool.name}
        </Text>
        {layout === 'detailed' && (
          <Text size="sm" c="dimmed" className="tool-panel-overlay__tile-description">
            {tool.description}
          </Text>
        )}
        {matchedLine && (
          <Text size="xs" c="dimmed" className="tool-panel-overlay__tile-match">
            {matchedLine}
          </Text>
        )}
        {layout === 'detailed' && binding && (
          <div className="tool-panel-overlay__tile-hotkey">
            <span>{t('settings.hotkeys.shortcut', 'Shortcut')}</span>
            <HotkeyDisplay binding={binding} />
          </div>
        )}
      </div>
    </div>
  );

  const wrappedContent = layout === 'compact' && tooltipContent ? (
    <Tooltip content={tooltipContent} position="top" arrow>
      {content}
    </Tooltip>
  ) : (
    content
  );

  if (navProps) {
    return (
      <a
        href={navProps.href}
        onClick={navProps.onClick}
        className="tool-panel-overlay__tile-link"
        aria-disabled={isUnavailable}
        data-variant={layout}
      >
        {wrappedContent}
      </a>
    );
  }

  if (tool.link && !isUnavailable) {
    return (
      <a
        href={tool.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleButtonClick}
        className="tool-panel-overlay__tile-link"
        data-variant={layout}
      >
        {wrappedContent}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={handleButtonClick}
      className="tool-panel-overlay__tile-button"
      data-variant={layout}
      aria-disabled={isUnavailable}
    >
      {wrappedContent}
    </button>
  );
};

export default ToolPanelOverlayTile;

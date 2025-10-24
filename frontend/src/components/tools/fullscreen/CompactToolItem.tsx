import React from 'react';
import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../shared/Tooltip';
import HotkeyDisplay from '../../hotkeys/HotkeyDisplay';
import FavoriteStar from '../toolPicker/FavoriteStar';
import { ToolRegistryEntry, getSubcategoryColor } from '../../../data/toolsTaxonomy';
import { getIconBackground, getIconStyle, getItemClasses, useToolMeta } from './shared';

interface CompactToolItemProps {
  id: string;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onClick: () => void;
  tooltipPortalTarget?: HTMLElement | undefined;
}

const CompactToolItem: React.FC<CompactToolItemProps> = ({ id, tool, isSelected, onClick, tooltipPortalTarget }) => {
  const { t } = useTranslation();
  const { binding, isFav, toggleFavorite, disabled } = useToolMeta(id, tool);
  const categoryColor = getSubcategoryColor(tool.subcategoryId);
  const iconBg = getIconBackground(categoryColor, false);
  const iconClasses = 'tool-panel__fullscreen-list-icon';

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

  const compactButton = (
    <button
      type="button"
      className={`tool-panel__fullscreen-list-item ${getItemClasses(false)} ${isSelected ? 'tool-panel__fullscreen-list-item--selected' : ''} ${!disabled ? 'tool-panel__fullscreen-list-item--with-star' : ''}`}
      onClick={onClick}
      aria-disabled={disabled}
      disabled={disabled}
      data-tour={`tool-button-${id}`}
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
      </span>
      {!disabled && (
        <div className="tool-panel__fullscreen-star-compact">
          <FavoriteStar
            isFavorite={isFav}
            onToggle={toggleFavorite}
            size="xs"
          />
        </div>
      )}
    </button>
  );

  const tooltipContent = disabled
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

export default CompactToolItem;



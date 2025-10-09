import React from 'react';
import { ActionIcon, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import HotkeyDisplay from '../../hotkeys/HotkeyDisplay';
import { ToolRegistryEntry, getSubcategoryColor } from '../../../data/toolsTaxonomy';
import { getIconBackground, getIconStyle, getItemClasses, useToolMeta } from './shared';

interface DetailedToolItemProps {
  id: string;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onClick: () => void;
}

const DetailedToolItem: React.FC<DetailedToolItemProps> = ({ id, tool, isSelected, onClick }) => {
  const { t } = useTranslation();
  const { binding, isFav, toggleFavorite, disabled } = useToolMeta(id, tool);

  const categoryColor = getSubcategoryColor(tool.subcategoryId);
  const iconBg = getIconBackground(categoryColor, true);
  const iconClasses = 'tool-panel__fullscreen-icon';

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

  return (
    <button
      type="button"
      className={`tool-panel__fullscreen-item ${getItemClasses(true)} ${isSelected ? 'tool-panel__fullscreen-item--selected' : ''} tool-panel__fullscreen-item--with-star`}
      onClick={onClick}
      aria-disabled={disabled}
      disabled={disabled}
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
      </span>
      {!disabled && (
        <ActionIcon
          variant="subtle"
          radius="xl"
          size="sm"
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleFavorite(); }}
          className="tool-panel__fullscreen-star"
          aria-label={isFav ? t('toolPanel.fullscreen.unfavorite', 'Remove from favourites') : t('toolPanel.fullscreen.favorite', 'Add to favourites')}
        >
          {/* Star icons kept inline to avoid new dependency here */}
          {isFav ? (
            <span className="material-icons" style={{ color: 'var(--special-color-favorites)', fontSize: '20px' }}>star</span>
          ) : (
            <span className="material-icons" style={{ fontSize: '20px' }}>star_border</span>
          )}
        </ActionIcon>
      )}
    </button>
  );
};

export default DetailedToolItem;



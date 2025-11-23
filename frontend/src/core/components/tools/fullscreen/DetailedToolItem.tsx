import React from 'react';
import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import HotkeyDisplay from '@app/components/hotkeys/HotkeyDisplay';
import FavoriteStar from '@app/components/tools/toolPicker/FavoriteStar';
import { ToolRegistryEntry, getSubcategoryColor } from '@app/data/toolsTaxonomy';
import { getIconBackground, getIconStyle, getItemClasses, useToolMeta, getDisabledLabel } from '@app/components/tools/fullscreen/shared';

interface DetailedToolItemProps {
  id: string;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onClick: () => void;
}

const DetailedToolItem: React.FC<DetailedToolItemProps> = ({ id, tool, isSelected, onClick }) => {
  const { t } = useTranslation();
  const { binding, isFav, toggleFavorite, disabled, disabledReason } = useToolMeta(id, tool);

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

  const { key: disabledKey, fallback: disabledFallback } = getDisabledLabel(disabledReason);
  const disabledMessage = t(disabledKey, disabledFallback);

  return (
    <button
      type="button"
      className={`tool-panel__fullscreen-item ${getItemClasses(true)} ${isSelected ? 'tool-panel__fullscreen-item--selected' : ''} tool-panel__fullscreen-item--with-star`}
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
      <span className="tool-panel__fullscreen-body">
        <Text fw={600} size="sm" className="tool-panel__fullscreen-name">
          {tool.name}
        </Text>
        <Text size="sm" c="dimmed" className="tool-panel__fullscreen-description">
          {disabled ? (
            <>
              <strong>{disabledMessage} </strong>
              {tool.description}
            </>
          ) : tool.description}
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
        <div className="tool-panel__fullscreen-star">
          <FavoriteStar
            isFavorite={isFav}
            onToggle={toggleFavorite}
            size="sm"
          />
        </div>
      )}
    </button>
  );
};

export default DetailedToolItem;



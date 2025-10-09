import React from 'react';
import { ActionIcon, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../shared/Tooltip';
import HotkeyDisplay from '../../hotkeys/HotkeyDisplay';
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
        <ActionIcon
          variant="subtle"
          radius="xl"
          size="xs"
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleFavorite(); }}
          className="tool-panel__fullscreen-star-compact"
          aria-label={isFav ? t('toolPanel.fullscreen.unfavorite', 'Remove from favourites') : t('toolPanel.fullscreen.favorite', 'Add to favourites')}
        >
          {/* Star icons kept inline to avoid new dependency here */}
          {isFav ? (
            <span className="material-icons" style={{ color: 'var(--special-color-favorites)', fontSize: '16px' }}>star</span>
          ) : (
            <span className="material-icons" style={{ fontSize: '16px' }}>star_border</span>
          )}
        </ActionIcon>
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



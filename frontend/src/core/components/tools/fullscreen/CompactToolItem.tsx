import React from 'react';
import { Text, Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@app/components/shared/Tooltip';
import HotkeyDisplay from '@app/components/hotkeys/HotkeyDisplay';
import FavoriteStar from '@app/components/tools/toolPicker/FavoriteStar';
import { ToolRegistryEntry, getSubcategoryColor } from '@app/data/toolsTaxonomy';
import { getIconBackground, getIconStyle, getItemClasses, useToolMeta } from '@app/components/tools/fullscreen/shared';

interface CompactToolItemProps {
  id: string;
  tool: ToolRegistryEntry;
  isSelected: boolean;
  onClick: () => void;
  tooltipPortalTarget?: HTMLElement | undefined;
}

const CompactToolItem: React.FC<CompactToolItemProps> = ({ id, tool, isSelected, onClick, tooltipPortalTarget }) => {
  const { t } = useTranslation();
  const { binding, isFav, toggleFavorite, disabled, premiumEnabled } = useToolMeta(id, tool);
  const categoryColor = getSubcategoryColor(tool.subcategoryId);
  const iconBg = getIconBackground(categoryColor, false);
  const iconClasses = 'tool-panel__fullscreen-list-icon';
  
  // Determine why tool is disabled for tooltip content
  const isUnavailable = !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';
  const requiresPremiumButNotEnabled = tool.requiresPremium === true && premiumEnabled !== true;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Text fw={600} size="sm" className="tool-panel__fullscreen-name">
            {tool.name}
          </Text>
          {tool.versionStatus === 'alpha' && (
            <Badge
              size="xs"
              variant="light"
              color="orange"
            >
              {t('toolPanel.alpha', 'Alpha')}
            </Badge>
          )}
        </div>
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

  // Determine tooltip content based on disabled reason
  let tooltipContent: React.ReactNode;
  if (requiresPremiumButNotEnabled) {
    tooltipContent = (
      <span>
        <strong>{t('toolPanel.premiumFeature', 'Premium feature:')}</strong> {tool.description}
      </span>
    );
  } else if (isUnavailable) {
    tooltipContent = (
      <span>
        <strong>{t('toolPanel.fullscreen.comingSoon', 'Coming soon:')}</strong> {tool.description}
      </span>
    );
  } else {
    tooltipContent = (
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
  }

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



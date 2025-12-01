import React from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import styles from '@app/components/shared/HoverActionMenu.module.css';
import { Z_INDEX_HOVER_ACTION_MENU } from '@app/styles/zIndex';

export interface HoverAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  color?: string;
  hidden?: boolean;
}

interface HoverActionMenuProps {
  show: boolean;
  actions: HoverAction[];
  position?: 'inside' | 'outside';
  className?: string;
}

const HoverActionMenu: React.FC<HoverActionMenuProps> = ({
  show,
  actions,
  position = 'inside',
  className = ''
}) => {
  const visibleActions = actions.filter(action => !action.hidden);

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div
      className={`${styles.hoverMenu} ${position === 'outside' ? styles.outside : styles.inside} ${className}`}
      style={{ opacity: show ? 1 : 0, zIndex: Z_INDEX_HOVER_ACTION_MENU }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {visibleActions.map((action) => (
        <Tooltip key={action.id} label={action.label}>
          <ActionIcon
            size="md"
            variant="subtle"
            disabled={action.disabled}
            onClick={action.onClick}
            c={action.color}
            style={{ color: action.color || 'var(--right-rail-icon)' }}
          >
            {action.icon}
          </ActionIcon>
        </Tooltip>
      ))}
    </div>
  );
};

export default HoverActionMenu;

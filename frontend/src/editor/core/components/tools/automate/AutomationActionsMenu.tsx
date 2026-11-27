import { Menu } from "@mantine/core";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon, type IconName } from "@editor/ui/Icon";

export interface AutomationAction {
  key: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  danger?: boolean;
  /** Draws a divider above this item, to set destructive actions apart. */
  separated?: boolean;
}

interface AutomationActionsMenuProps {
  actions: AutomationAction[];
  label: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

/** The kebab used on library rows and the workspace header, so both offer the same actions. */
export default function AutomationActionsMenu({
  actions,
  label,
  className,
  onOpenChange,
}: AutomationActionsMenuProps) {
  if (actions.length === 0) return null;
  return (
    <Menu
      position="bottom-end"
      withinPortal
      onOpen={() => onOpenChange?.(true)}
      onClose={() => onOpenChange?.(false)}
    >
      <Menu.Target>
        <ActionIcon
          variant="tertiary"
          accent="neutral"
          size="sm"
          aria-label={label}
          className={className}
          onClick={(event) => event.stopPropagation()}
        >
          <Icon name="ellipsis-vertical" size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {actions.map((action) => [
          action.separated ? (
            <Menu.Divider key={`${action.key}-divider`} />
          ) : null,
          <Menu.Item
            key={action.key}
            style={action.danger ? { color: "var(--c-danger)" } : undefined}
            leftSection={<Icon name={action.icon} size={16} />}
            onClick={(event) => {
              event.stopPropagation();
              action.onClick();
            }}
          >
            {action.label}
          </Menu.Item>,
        ])}
      </Menu.Dropdown>
    </Menu>
  );
}

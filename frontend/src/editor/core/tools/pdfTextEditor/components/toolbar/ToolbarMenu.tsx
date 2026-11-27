import { useState, type ReactElement, type ReactNode } from "react";
import { Menu, Tooltip } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import {
  NO_SHRINK,
  selectionBarMenuProps,
} from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";

export type ToolbarMenuPosition = "bottom-start" | "top-start" | "top";

interface ToolbarMenuProps {
  label: string;
  icon: IconName;
  testId: string;
  children: ReactNode;
  tooltip?: string;
  size?: "sm" | "xl";
  disabled?: boolean;
  pressed?: boolean;
  inPopover?: boolean;
  position?: ToolbarMenuPosition;
  target?: ReactElement;
}

export function ToolbarMenu({
  label,
  icon,
  testId,
  children,
  tooltip = label,
  size = "sm",
  disabled = false,
  pressed,
  inPopover = false,
  position = "bottom-start",
  target,
}: ToolbarMenuProps) {
  const [opened, setOpened] = useState(false);
  return (
    <Menu
      shadow="md"
      position={position}
      withinPortal={!inPopover}
      disabled={disabled}
      onOpen={() => setOpened(true)}
      onClose={() => setOpened(false)}
    >
      {target ? (
        <Menu.Target>{target}</Menu.Target>
      ) : (
        <Tooltip label={tooltip} disabled={opened}>
          <Menu.Target>
            <Button
              variant={pressed ? "primary" : "tertiary"}
              accent={pressed ? "default" : "neutral"}
              size={size}
              disabled={disabled}
              aria-label={label}
              aria-pressed={pressed}
              data-testid={testId}
              style={NO_SHRINK}
              leftSection={<Icon name={icon} size={20} />}
            />
          </Menu.Target>
        </Tooltip>
      )}
      <Menu.Dropdown {...selectionBarMenuProps}>{children}</Menu.Dropdown>
    </Menu>
  );
}

export function MenuChoice({
  checked,
  icon,
  onClick,
  testId,
  children,
}: {
  checked: boolean;
  icon?: IconName;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Menu.Item
      role="menuitemradio"
      aria-checked={checked}
      leftSection={icon ? <Icon name={icon} size={18} /> : undefined}
      rightSection={checked ? <Icon name="check" size={16} /> : undefined}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Menu.Item>
  );
}

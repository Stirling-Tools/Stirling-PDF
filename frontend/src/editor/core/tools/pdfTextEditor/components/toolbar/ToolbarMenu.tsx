import type { ReactElement, ReactNode } from "react";
import { Menu, Tooltip } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import { NO_SHRINK } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";

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
  position?: "bottom-start" | "top";
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
  return (
    <Menu shadow="md" position={position} withinPortal={!inPopover}>
      <Menu.Target>
        {target ?? (
          <Tooltip label={tooltip}>
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
          </Tooltip>
        )}
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

export function MenuChoice({
  checked,
  icon,
  iconFilled = false,
  onClick,
  testId,
  children,
}: {
  checked: boolean;
  icon?: IconName;
  iconFilled?: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Menu.Item
      role="menuitemradio"
      aria-checked={checked}
      leftSection={
        icon ? (
          <Icon
            name={icon}
            size={18}
            filled={iconFilled}
            style={iconFilled ? { color: "var(--c-text-subtle)" } : undefined}
          />
        ) : undefined
      }
      rightSection={checked ? <Icon name="check" size={16} /> : undefined}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Menu.Item>
  );
}

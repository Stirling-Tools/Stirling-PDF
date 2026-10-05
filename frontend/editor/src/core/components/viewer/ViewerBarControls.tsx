import { forwardRef, type ReactNode } from "react";
import { Menu } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon, type IconName } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { useIsMobile } from "@app/hooks/useIsMobile";
import "@app/components/viewer/ViewerBarControls.css";

interface BarButtonProps {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  /** Extra words for a tooltip, when the label alone leaves something out. */
  hint?: string;
  trailing?: ReactNode;
  /** Icon alone, named by its tooltip: for the bar's compact action row. */
  iconOnly?: boolean;
  onClick?: () => void;
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  testId?: string;
}

/**
 * A viewer toolbar control named beside its icon. On a phone the bar has no
 * room for words, so it falls back to the icon with the label as a tooltip.
 */
export const BarButton = forwardRef<HTMLButtonElement, BarButtonProps>(
  function BarButton(
    {
      icon,
      label,
      active,
      disabled,
      hint,
      trailing,
      iconOnly,
      onClick,
      testId,
      ...rest
    },
    ref,
  ) {
    const isMobile = useIsMobile();
    const compact = isMobile || iconOnly;
    const button = iconOnly ? (
      <ActionIcon
        ref={ref}
        variant="tertiary"
        className="workbench-bar-action-icon viewer-bar-button"
        data-active={active ? "true" : undefined}
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        data-testid={testId}
        {...rest}
      >
        <Icon name={icon} size="1rem" />
      </ActionIcon>
    ) : (
      <Button
        ref={ref}
        size="sm"
        variant="tertiary"
        accent="neutral"
        className="viewer-bar-button"
        data-active={active ? "true" : undefined}
        leftSection={<Icon name={icon} size={18} />}
        rightSection={trailing}
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        data-testid={testId}
        {...rest}
      >
        {compact ? null : label}
      </Button>
    );
    const tip = hint ?? (compact ? label : null);
    return tip ? (
      <Tooltip
        content={tip}
        position="bottom"
        arrow
        portalTarget={document.body}
      >
        <span className="viewer-bar-button-wrap">{button}</span>
      </Tooltip>
    ) : (
      button
    );
  },
);

/** A labelled toolbar control that opens a menu of related actions. */
export function BarMenu({
  icon,
  label,
  active,
  disabled,
  testId,
  children,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Menu shadow="md" position="bottom-start" withinPortal closeOnItemClick>
      <Menu.Target>
        <BarButton
          icon={icon}
          label={label}
          active={active}
          disabled={disabled}
          testId={testId}
          trailing={<Icon name="chevron-down" size={14} />}
        />
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

/** Trailing slot for a toggle in a menu: a check while it is on. */
export function toggleMark(on: boolean) {
  return on ? <Icon name="check" size="1rem" /> : null;
}

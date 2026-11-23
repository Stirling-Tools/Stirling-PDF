import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { Menu } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon, type IconName } from "@editor/ui/Icon";
import { Tooltip, type TooltipProps } from "@editor/components/shared/Tooltip";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import { useTranslation } from "react-i18next";
import "@editor/components/viewer/ViewerBarControls.css";

interface BarButtonProps {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  /** Tooltip text when the label alone leaves something out. */
  hint?: string;
  trailing?: ReactNode;
  /** Icon alone, named by its tooltip. */
  iconOnly?: boolean;
  /** An icon-only button's size, to sit with the controls around it. */
  size?: "sm" | "lg";
  tooltipPosition?: TooltipProps["position"];
  /** Holds the tooltip back, as while the button's own menu is open over it. */
  tooltipDisabled?: boolean;
  onClick?: () => void;
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  onPointerEnter?: React.PointerEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  testId?: string;
  /** Joined with the control's own classes, as a menu or popover target adds. */
  className?: string;
}

/**
 * A viewer toolbar control named beside its icon. A phone's bar, or a row too
 * narrow for the words, falls back to the icon with the label as its tooltip.
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
      size,
      tooltipPosition = "bottom",
      tooltipDisabled,
      testId,
      className,
      ...rest
    },
    ref,
  ) {
    const isMobile = useIsMobile();
    const compact = isMobile || iconOnly;
    // A narrow row hides the words in CSS; only then does the tooltip name it.
    const labelRef = useRef<HTMLSpanElement>(null);
    const [labelHidden, setLabelHidden] = useState(false);
    useEffect(() => {
      const el = labelRef.current;
      if (compact || !el) return undefined;
      const check = () => setLabelHidden(el.offsetWidth === 0);
      check();
      const observer = new ResizeObserver(check);
      observer.observe(el);
      return () => observer.disconnect();
    }, [compact]);
    const button = compact ? (
      <ActionIcon
        ref={ref}
        size={size}
        variant={active ? "primary" : "tertiary"}
        className={
          [size ? undefined : "workbench-bar-action-icon", className]
            .filter(Boolean)
            .join(" ") || undefined
        }
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        data-testid={testId}
        {...rest}
      >
        <Icon name={icon} size={size ? 18 : "1rem"} />
      </ActionIcon>
    ) : (
      <Button
        ref={ref}
        size="sm"
        variant="tertiary"
        accent="neutral"
        className={["viewer-bar-button", className].filter(Boolean).join(" ")}
        data-active={active ? "true" : undefined}
        leftSection={<Icon name={icon} size="1rem" />}
        rightSection={trailing}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        data-testid={testId}
        {...rest}
      >
        <span ref={labelRef} className="viewer-bar-button__label">
          {label}
        </span>
      </Button>
    );
    const tip = hint ?? label;
    const tipShown = compact || labelHidden || hint != null;
    return (
      <Tooltip
        content={tip}
        disabled={tooltipDisabled || !tipShown}
        position={tooltipPosition}
        offset={12}
        arrow
        portalTarget={document.body}
      >
        {/* Mantine's Popover and Menu targets pass no ref through a Tooltip. */}
        <span className="viewer-bar-button-wrap">{button}</span>
      </Tooltip>
    );
  },
);

/**
 * A labelled toolbar control that opens a menu of related settings. It stays
 * open as they change, so several can be set and each seen taking effect.
 */
export function BarMenu({
  icon,
  label,
  disabled,
  testId,
  children,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Menu
      shadow="md"
      position="bottom-start"
      withinPortal
      closeOnItemClick={false}
      opened={opened}
      onChange={setOpened}
    >
      <Menu.Target>
        <BarButton
          icon={icon}
          label={label}
          tooltipDisabled={opened}
          disabled={disabled}
          testId={testId}
          trailing={<Icon name="chevron-down" size={14} />}
        />
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

/**
 * Props for a toggle in a menu: a tick while it is on, and a description
 * pointing at a SelectedNote, since Mantine's menu items keep the plain
 * menuitem role and so cannot carry aria-checked.
 */
export function toggleProps(on: boolean, selectedNoteId: string) {
  return {
    rightSection: on ? <Icon name="check" size="1rem" /> : null,
    "data-checked": on || undefined,
    "aria-describedby": on ? selectedNoteId : undefined,
  };
}

/** The hidden "Selected" text the menu's toggles that are on point to. */
export function SelectedNote({ id }: { id: string }) {
  const { t } = useTranslation();
  return (
    <span id={id} hidden>
      {t("viewer.menuSelected", "Selected")}
    </span>
  );
}

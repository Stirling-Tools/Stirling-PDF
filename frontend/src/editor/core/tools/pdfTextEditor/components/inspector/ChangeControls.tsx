import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Group, Popover, Text } from "@mantine/core";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon, type IconName } from "@editor/ui/Icon";

/** A block's heading, with its document-wide control at the end of the row. */
export function BlockHeading({
  children,
  extra,
  action,
}: {
  children: ReactNode;
  extra?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={500}>
          {children}
        </Text>
        {extra}
      </Group>
      {action}
    </Group>
  );
}

type ChangeButtonProps = {
  icon?: IconName;
  label: string;
  testId: string;
} & Omit<ComponentPropsWithoutRef<"button">, "children">;

/** One icon button for every document-wide change, named by its tooltip. */
export const ChangeButton = forwardRef<HTMLButtonElement, ChangeButtonProps>(
  function ChangeButton({ icon = "pencil", label, testId, ...rest }, ref) {
    return (
      <Tooltip position="left" content={label} arrow>
        <ActionIcon
          ref={ref}
          size="sm"
          variant="secondary"
          accent="neutral"
          aria-label={label}
          data-testid={testId}
          style={{ flexShrink: 0 }}
          {...rest}
        >
          <Icon name={icon} size={16} />
        </ActionIcon>
      </Tooltip>
    );
  },
);

/**
 * A change picked over the panel: opens below its block's heading and covers
 * the panel rather than the page, so the page shows the change as it is tried.
 */
export function ChangePopover({
  opened,
  anchor,
  width = "target",
  children,
}: {
  opened: boolean;
  anchor: ReactNode;
  /** Wider than the panel reaches out over the page from its right edge. */
  width?: number | "target";
  children: ReactNode;
}) {
  return (
    <Popover
      opened={opened}
      position={width === "target" ? "bottom" : "bottom-end"}
      // Never wider than the screen, which a phone's is.
      width={width === "target" ? width : `min(${width}px, calc(100vw - 2rem))`}
      // Clear, but it stops edits to the page and panel while a change is
      // previewing, so Cancel always has the preview to undo.
      withOverlay
      overlayProps={{ backgroundOpacity: 0 }}
      shadow="md"
      withinPortal
      trapFocus
      // The block's pencil buttons open it, not the heading it hangs from,
      // so the heading carries no popup roles of its own.
      withRoles={false}
      // Done and Cancel close it, each saying what happens to the preview.
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Popover.Target>
        <div>{anchor}</div>
      </Popover.Target>
      <Popover.Dropdown>
        {/* Focus lands on the popover, not its first field: the font list
            opens on focus and would cover what the popover offers. */}
        <div tabIndex={-1} data-autofocus style={{ outline: "none" }}>
          {children}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

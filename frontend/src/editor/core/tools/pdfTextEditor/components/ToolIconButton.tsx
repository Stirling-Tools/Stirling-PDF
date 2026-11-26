import { useState } from "react";
import { Tooltip } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";

/**
 * An icon button whose tooltip goes away once it is clicked: the action has
 * happened, and the tooltip would otherwise sit over what it opened until the
 * pointer moves off.
 */
export function ToolIconButton({
  label,
  icon,
  onClick,
  testId,
  disabled,
  pressed,
  tooltip,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
  pressed?: boolean;
  tooltip?: string;
}) {
  const [clicked, setClicked] = useState(false);
  return (
    <Tooltip label={tooltip ?? label} disabled={clicked}>
      {/* The reset sits on a wrapper: a button its click disabled (the last
          undo) gets no pointer events, so its own leave would never fire. */}
      <span
        style={{ display: "inline-flex", flexShrink: 0 }}
        onPointerLeave={() => setClicked(false)}
      >
        <Button
          size="sm"
          variant={pressed ? "primary" : "tertiary"}
          accent={pressed ? "default" : "neutral"}
          onClick={() => {
            setClicked(true);
            onClick();
          }}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
          data-testid={testId}
          style={{ flexShrink: 0 }}
          leftSection={<Icon name={icon} size={20} />}
        />
      </span>
    </Tooltip>
  );
}

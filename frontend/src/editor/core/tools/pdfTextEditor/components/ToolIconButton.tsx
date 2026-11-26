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
      <Button
        size="sm"
        variant={pressed ? "primary" : "tertiary"}
        accent={pressed ? "default" : "neutral"}
        onClick={() => {
          setClicked(true);
          onClick();
        }}
        onMouseLeave={() => setClicked(false)}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        data-testid={testId}
        style={{ flexShrink: 0 }}
        leftSection={<Icon name={icon} size={20} />}
      />
    </Tooltip>
  );
}

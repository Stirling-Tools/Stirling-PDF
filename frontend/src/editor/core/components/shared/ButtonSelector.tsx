import type { ReactNode } from "react";
import { Stack, Text, Tooltip } from "@mantine/core";
import FitText from "@editor/components/shared/FitText";
import { Icon, type IconName } from "@editor/ui/Icon";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import classes from "@editor/components/shared/ButtonSelector.module.css";

export interface ButtonOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
  tooltip?: string; // Tooltip shown on hover (useful for explaining why option is disabled)
  /** Stacks the icon over the label; give every option one, or the segments misalign. */
  icon?: IconName;
}

interface ButtonSelectorProps<T> {
  value: T | undefined;
  onChange: (value: T) => void;
  options: ButtonOption<T>[];
  label?: ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  textClassName?: string;
}

const ButtonSelector = <T extends string | number>({
  value,
  onChange,
  options,
  label = undefined,
  disabled = false,
  fullWidth = true,
  textClassName,
}: ButtonSelectorProps<T>) => {
  const selectedValue = value === undefined ? "" : String(value);
  const withIcons = options.some((option) => option.icon);

  const segmentedOptions = options.map((option) => {
    const isDisabled = disabled || option.disabled;
    const fitText = withIcons ? (
      <span className={classes.iconLabel}>
        {option.icon && <Icon name={option.icon} size={18} />}
        <span className={classes.iconLabelText} title={option.label}>
          {option.label}
        </span>
      </span>
    ) : (
      <FitText
        text={option.label}
        lines={1}
        minimumFontScale={0.6}
        fontSize={14}
        className={textClassName}
      />
    );

    return {
      value: String(option.value),
      disabled: isDisabled,
      label:
        option.tooltip && isDisabled ? (
          <Tooltip label={option.tooltip} position="top" withArrow>
            <span>{fitText}</span>
          </Tooltip>
        ) : (
          fitText
        ),
    };
  });

  const handleChange = (next: string) => {
    const matched = options.find((option) => String(option.value) === next);
    if (matched) {
      onChange(matched.value);
    }
  };

  return (
    <Stack gap="var(--mantine-spacing-sm)">
      {label && (
        <Text
          style={{
            fontSize: "var(--mantine-font-size-sm)",
            lineHeight: "var(--mantine-line-height-sm)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--c-text-muted)",
          }}
        >
          {label}
        </Text>
      )}

      <SegmentedControl
        className={
          withIcons ? `${classes.fitted} ${classes.withIcons}` : classes.fitted
        }
        options={segmentedOptions}
        value={selectedValue}
        onChange={handleChange}
        fullWidth={fullWidth}
      />
    </Stack>
  );
};

export default ButtonSelector;

import { Stack, Text, Tooltip } from "@mantine/core";
import FitText from "@app/components/shared/FitText";
import { SegmentedControl } from "@app/ui/SegmentedControl";

export interface ButtonOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
  tooltip?: string; // Tooltip shown on hover (useful for explaining why option is disabled)
}

interface ButtonSelectorProps<T> {
  value: T | undefined;
  onChange: (value: T) => void;
  options: ButtonOption<T>[];
  label?: string;
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

  const segmentedOptions = options.map((option) => {
    const isDisabled = disabled || option.disabled;
    const fitText = (
      <FitText
        text={option.label}
        lines={1}
        minimumFontScale={0.5}
        fontSize={10}
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
      {/* Label (if it exists) */}
      {label && (
        <Text
          style={{
            fontSize: "var(--mantine-font-size-sm)",
            lineHeight: "var(--mantine-line-height-sm)",
            fontWeight: "var(--font-weight-medium)",
          }}
        >
          {label}
        </Text>
      )}

      <SegmentedControl
        options={segmentedOptions}
        value={selectedValue}
        onChange={handleChange}
        fullWidth={fullWidth}
      />
    </Stack>
  );
};

export default ButtonSelector;

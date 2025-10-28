import { Button, Group, Stack, Text } from "@mantine/core";
import FitText from "@app/components/shared/FitText";

export interface ButtonOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface ButtonSelectorProps<T> {
  value: T | undefined;
  onChange: (value: T) => void;
  options: ButtonOption<T>[];
  label?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  buttonClassName?: string;
  textClassName?: string;
}

const ButtonSelector = <T extends string | number>({
  value,
  onChange,
  options,
  label = undefined,
  disabled = false,
  fullWidth = true,
  buttonClassName,
  textClassName,
}: ButtonSelectorProps<T>) => {
  return (
    <Stack gap='var(--mantine-spacing-sm)'>
      {/* Label (if it exists) */}
      {label && <Text style={{
        fontSize: "var(--mantine-font-size-sm)",
        lineHeight: "var(--mantine-line-height-sm)",
        fontWeight: "var(--font-weight-medium)",
      }}>{label}</Text>}

      {/* Buttons */}
      <Group gap='4px'>
        {options.map((option) => (
          <Button
            key={option.value}
            variant={value === option.value ? 'filled' : 'outline'}
            color={value === option.value ? 'var(--color-primary-500)' : 'var(--text-muted)'}
            onClick={() => onChange(option.value)}
            disabled={disabled || option.disabled}
            className={buttonClassName}
            style={{
              flex: fullWidth ? 1 : undefined,
              height: 'auto',
              minHeight: '2.5rem',
              fontSize: 'var(--mantine-font-size-sm)',
              lineHeight: '1.4',
              paddingTop: '0.5rem',
              paddingBottom: '0.5rem'
            }}
          >
            <FitText
              text={option.label}
              lines={1}
              minimumFontScale={0.5}
              fontSize={10}
              className={textClassName}
            />
          </Button>
        ))}
      </Group>
    </Stack>
  );
};

export default ButtonSelector;

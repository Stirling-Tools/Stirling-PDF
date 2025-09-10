import { Button } from "@mantine/core";

export interface ButtonOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface ButtonSelectorProps<T> {
  value: T | undefined;
  onChange: (value: T) => void;
  options: ButtonOption<T>[];
  disabled?: boolean;
  fullWidth?: boolean;
}

const ButtonSelector = <T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  fullWidth = true,
}: ButtonSelectorProps<T>) => {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {options.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? 'filled' : 'outline'}
          color={value === option.value ? 'var(--color-primary-500)' : 'var(--text-muted)'}
          onClick={() => onChange(option.value)}
          disabled={disabled || option.disabled}
          style={{
            flex: fullWidth ? 1 : undefined,
            height: 'auto',
            minHeight: '2.5rem',
            fontSize: 'var(--mantine-font-size-sm)'
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
};

export default ButtonSelector;

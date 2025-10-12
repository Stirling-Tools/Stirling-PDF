import { useState, useEffect } from "react";
import { Stack, Text, NumberInput } from "@mantine/core";

interface NumberInputWithUnitProps {
  label: string;
  value: number;
  onChange: (value: number | string) => void;
  unit: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}

const NumberInputWithUnit = ({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  disabled = false
}: NumberInputWithUnitProps) => {
  const [localValue, setLocalValue] = useState<number | string>(value);

  // Sync local value when external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    onChange(localValue);
  };

  return (
    <Stack gap="xs" style={{ flex: 1 }}>
      <Text size="xs" fw={500} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </Text>
      <NumberInput
        value={localValue}
        onChange={setLocalValue}
        onBlur={handleBlur}
        min={min}
        max={max}
        disabled={disabled}
        rightSection={
          <Text size="sm" c="dimmed" pr="sm">
            {unit}
          </Text>
        }
        rightSectionWidth={unit.length * 8 + 20} // Dynamic width based on unit length
      />
    </Stack>
  );
};

export default NumberInputWithUnit;

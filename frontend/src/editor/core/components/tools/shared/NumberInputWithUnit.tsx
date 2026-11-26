import { useState, useEffect, type ReactNode } from "react";
import { Text, NumberInput } from "@mantine/core";

interface NumberInputWithUnitProps {
  label: ReactNode;
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
  disabled = false,
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
    <NumberInput
      label={label}
      value={localValue}
      onChange={setLocalValue}
      onBlur={handleBlur}
      min={min}
      max={max}
      disabled={disabled}
      style={{ flex: 1 }}
      rightSection={
        <Text size="sm" c="dimmed" pr="sm">
          {unit}
        </Text>
      }
      rightSectionWidth={unit.length * 8 + 20} // Dynamic width based on unit length
    />
  );
};

export default NumberInputWithUnit;

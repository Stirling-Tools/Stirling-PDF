import { useId } from "react";
import { Slider, Text, Group, NumberInput } from "@mantine/core";

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export default function SliderWithInput({
  label,
  value,
  onChange,
  disabled,
  min = 0,
  max = 200,
  step = 1,
  suffix = "%",
}: Props) {
  const labelId = useId();
  return (
    <div>
      <Text id={labelId} size="sm" fw={500} mb={8}>
        {label}
      </Text>
      <Group gap="md" align="center">
        <div style={{ flex: 1 }}>
          <Slider
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={onChange}
            disabled={disabled}
            // Mantine's slider thumb is a div, not an input, so the heading
            // above cannot name it through a <label> association.
            thumbLabel={label}
          />
        </div>
        <NumberInput
          value={value}
          onChange={(v) => onChange(Number(v) || 0)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          suffix={suffix}
          style={{ width: 90 }}
          aria-labelledby={labelId}
        />
      </Group>
    </div>
  );
}

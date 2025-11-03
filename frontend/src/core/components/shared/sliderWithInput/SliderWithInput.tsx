import { Slider, Text, Group, NumberInput } from '@mantine/core';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

export default function SliderWithInput({
  label,
  value,
  onChange,
  disabled,
  min = 0,
  max = 200,
  step = 1,
}: Props) {
  return (
    <div>
      <Text size="sm" fw={600} mb={4}>{label}: {Math.round(value)}%</Text>
      <Group gap="sm" align="center">
        <div style={{ flex: 1 }}>
          <Slider min={min} max={max} step={step} value={value} onChange={onChange} disabled={disabled} />
        </div>
        <NumberInput
          value={value}
          onChange={(v) => onChange(Number(v) || 0)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          style={{ width: 90 }}
        />
      </Group>
    </div>
  );
}



import { Tooltip, Popover, Stack, Text, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Icon } from "@app/ui/Icon";
import { useEventCallback } from "@app/hooks/useEventCallback";
import { ValueSlider } from "@app/components/annotation/shared/ValueSlider";
import { OPACITY_PRESETS } from "@app/components/annotation/shared/opacityPresets";

interface OpacityControlProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  disabled?: boolean;
}

const OPACITY_MARKS = OPACITY_PRESETS.map((preset) => ({
  value: preset,
  label: `${preset}%`,
}));

export function OpacityControl({
  value,
  onChange,
  disabled = false,
}: OpacityControlProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const handleChange = useEventCallback(onChange);
  const label = t("annotation.opacity", "Opacity");

  return (
    <Popover opened={opened} onChange={setOpened} position="top" withArrow>
      <Popover.Target>
        <Tooltip label={label} withArrow>
          <button
            type="button"
            className="embedpdf-floating-btn"
            onClick={() => setOpened(!opened)}
            disabled={disabled}
            aria-label={label}
          >
            <Icon name="droplet" size={18} />
          </button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" style={{ minWidth: 180 }}>
          <Group justify="space-between" align="baseline">
            <Text size="xs" fw={500}>
              {label}
            </Text>
            {/* The exact value; the presets are marks on the track, not the
                only choices, so a document arriving at 40% stays at 40%. */}
            <Text size="xs" c="dimmed">
              {Math.round(value)}%
            </Text>
          </Group>
          <ValueSlider
            value={value}
            min={10}
            max={100}
            onChange={handleChange}
            suffix="%"
            marks={OPACITY_MARKS}
            disabled={disabled}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

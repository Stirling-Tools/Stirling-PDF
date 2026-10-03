import { Tooltip, Popover, Stack, Text, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import {
  nearestOpacityPreset,
  OPACITY_PRESETS,
} from "@app/components/annotation/shared/opacityPresets";

interface OpacityControlProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function OpacityControl({
  value,
  onChange,
  disabled = false,
}: OpacityControlProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
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
            {/* The exact value, which the presets only approximate. */}
            <Text size="xs" c="dimmed">
              {Math.round(value)}%
            </Text>
          </Group>
          <SegmentedControl
            ariaLabel={label}
            size="xs"
            fullWidth
            value={String(nearestOpacityPreset(value))}
            onChange={(next) => onChange(Number(next))}
            options={OPACITY_PRESETS.map((preset) => ({
              value: String(preset),
              label: `${preset}%`,
            }))}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
